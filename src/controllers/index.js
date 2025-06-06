import dotenv from "dotenv";
import path from "path";
import Face from "../models/Face.js";
import Person from "../models/Person.js";
import {
  detectFacesFromImage,
  detectFacesFromVideo,
  cropFace,
  matchPerson,
  normalizeDescriptor,
  updateAverageDescriptor,
} from "../utils/faceDetection.js";
import { groupFaces } from "../utils/groupFaces.js";
import {
  createThumbnailFromVideo,
  getFilesSize,
  normalizeUploadFile,
} from "../utils/photos.js";
import { deleteFromR2, listAllFiles, uploadToR2 } from "../utils/r2Storage.js";
import { VIDEO_EXTENSIONS } from "../constants/index.js";
import { ObjectId } from "mongodb";
import UploadStatus from "../models/UploadStatus.js";

dotenv.config();

const processUpload = async (files, uploadId, uploadCreator, weddingName) => {
  try {
    console.log("uploadImages...");
    const start = performance.now();

    await UploadStatus.create({
      uploadId,
      status: "processing",
      uploaderEmail: uploadCreator,
      weddingName,
      createdAt: new Date(),
      totalFiles: files.length,
      processedFiles: 0,
    });

    const uploadedFiles = [];

    for (const file of files) {
      const isVideo = VIDEO_EXTENSIONS.includes(
        path.extname(file.originalname).toLowerCase()
      );

      let thumbnailUrl = "";
      if (isVideo) {
        const { buffer: thumbBuffer, fileName: thumbName } =
          await createThumbnailFromVideo(file.buffer, file.originalname);

        const thumbUpload = await uploadToR2(
          thumbBuffer,
          thumbName,
          "image/jpeg",
          uploadCreator,
          weddingName,
          { is_thumbnail: "true" }
        );

        thumbnailUrl = thumbUpload.url;
      }

      const { finalBuffer, finalMimeType, finalName } =
        await normalizeUploadFile(
          file.buffer,
          file.originalname,
          file.mimetype
        );

      console.log("mainUploadFileName...");
      const start2 = performance.now();
      const mainUploadFileName = await uploadToR2(
        finalBuffer,
        finalName,
        finalMimeType,
        uploadCreator,
        weddingName,
        isVideo ? { thumbnail_url: thumbnailUrl } : {}
      );
      const end2 = performance.now();
      console.log(
        `[mainUploadFileName] - took ${(end2 - start2).toFixed(2)} ms`
      );

      console.log("detectFacesFromImage...");
      const start3 = performance.now();

      let faces = [];
      let cropBuffer = finalBuffer;

      if (isVideo) {
        const result = await detectFacesFromVideo(finalBuffer, finalName);
        faces = result.faces;
        cropBuffer = result.cropSource;
      } else {
        faces = await detectFacesFromImage(finalBuffer);
      }

      const end3 = performance.now();
      console.log(
        `[detectFacesFromImage] - took ${(end3 - start3).toFixed(2)} ms`
      );

      console.log(`Detected ${faces.length} faces`);

      console.log("upload faces...");
      const start4 = performance.now();

      for (const [index, face] of faces.entries()) {
        const { descriptor, box } = face;

        const croppedBuffer = await cropFace(cropBuffer, box, 0.4);

        const croppedUpload = await uploadToR2(
          croppedBuffer,
          `face-${mainUploadFileName.fileName}-${index}.jpg`,
          "image/jpeg",
          uploadCreator,
          weddingName,
          { is_face: "true" }
        );

        const normalizedDescriptor = normalizeDescriptor(descriptor);
        const person = await matchPerson(descriptor);

        const personId = person
          ? person._id
          : (
              await Person.create({
                name: null,
                averageDescriptor: Array.from(normalizedDescriptor),
              })
            )._id;

        await Face.create({
          mediaFileName: mainUploadFileName.fileName,
          descriptor: Array.from(normalizedDescriptor),
          position: box,
          thumbnailUrl: croppedUpload.url,
          personId,
          originalUrl: mainUploadFileName.url,
        });

        await updateAverageDescriptor(personId);
      }

      const end4 = performance.now();
      console.log(`[upload faces] - took ${(end4 - start4).toFixed(2)} ms`);

      const fileUrl = `${process.env.R2_BUCKET_URL}/${mainUploadFileName}`;
      uploadedFiles.push({ fileName: mainUploadFileName, url: fileUrl });
    }

    console.log("groupFaces...");
    const start1 = performance.now();
    await groupFaces(); // TODO: check if this is needed here to be called with "await"
    const end1 = performance.now();
    console.log(`[groupFaces] - took ${(end1 - start1).toFixed(2)} ms`);

    await UploadStatus.updateOne(
      { uploadId },
      { $set: { status: "completed" } }
    );

    const end = performance.now();
    console.log(`[all - uploadImages] - took ${(end - start).toFixed(2)} ms`);
  } catch (error) {
    console.error("Upload failed:", error.response?.data || error.message);
    await UploadStatus.updateOne({ uploadId }, { $set: { status: "failed" } });
  }
};

export const uploadImages = async (req, res) => {
  const { uploadCreator, weddingName } = req.query;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  // const totalFilesSizeInMB = getFilesSize(files);
  // console.log("totalFilesSizeInMB: ", totalFilesSizeInMB);

  const uploadId = new ObjectId().toString();

  res.status(202).json({ uploadId });

  processUpload(files, uploadId, uploadCreator, weddingName);
};

export const getUploadStatus = async (req, res) => {
  const { uploadId } = req.query;

  if (!uploadId) {
    return res.status(400).json({ error: "Missing uploadId" });
  }

  try {
    const status = await UploadStatus.findOne({ uploadId });

    if (!status) {
      return res.status(404).json({ error: "Upload status not found" });
    }

    res.json({
      uploadId: status.uploadId,
      status: status.status,
      totalFiles: status.totalFiles,
      processedFiles: status.processedFiles,
      error: status.error || null,
      updatedAt: status.updatedAt,
      uploaderEmail: status.uploaderEmail,
      weddingName: status.weddingName,
    });
  } catch (err) {
    console.error("Failed to get upload status:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export const getPhotos = async (req, res) => {
  try {
    const { weddingName } = req.query;

    const files = await listAllFiles(weddingName);
    res.json({ success: true, photos: files });
  } catch (err) {
    console.error("Failed to list files:", err);
    res.status(500).json({ success: false, error: "Could not fetch files" });
  }
};

export const getPeople = async (req, res) => {
  const { uploadCreator, weddingName } = req.query;
  try {
    console.log("[getPeople] - Fetching people...");
    const start = performance.now();

    const people = await Person.find();

    const result = await Promise.all(
      people.map(async (person) => {
        const faces = await Face.find({ personId: person._id });

        const uniqueMediaMap = new Map();
        faces.forEach((face) => {
          if (!uniqueMediaMap.has(face.mediaFileName)) {
            uniqueMediaMap.set(face.mediaFileName, face);
          }
        });
        const uniqueFaces = Array.from(uniqueMediaMap.values());

        const getPhotoType = (face) => {
          return VIDEO_EXTENSIONS.includes(
            path.extname(face.mediaFileName).toLowerCase()
          )
            ? "video"
            : "photo";
        };

        return {
          personId: person._id,
          faceCount: uniqueFaces.length,
          sampleThumbnail: uniqueFaces[0]?.thumbnailUrl || null,
          mediaFiles: await Promise.all(
            uniqueFaces.map(async (face) => ({
              fileName: face.mediaFileName,
              url: face.originalUrl,
              type: getPhotoType(face),
              metadata: {
                uploader: uploadCreator,
                wedding_name: weddingName,
                thumbnail_url: face.thumbnailUrl,
              },
            }))
          ),
        };
      })
    );

    const end = performance.now();
    console.log(`[getPeople] - took ${(end - start).toFixed(2)} ms`);
    res.json(result);
  } catch (err) {
    console.error("Failed to fetch people:", err.message);
    res.status(500).json({ error: "Failed to fetch people" });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    const { userEmail, fileName } = req.body;
    await deleteFromR2(fileName);

    const facesToDelete = await Face.find({ mediaFileName: fileName });

    const affectedPersonIds = [
      ...new Set(
        facesToDelete.map((face) => face.personId?.toString()).filter(Boolean)
      ),
    ];

    await Face.deleteMany({ mediaFileName: fileName });

    for (const personId of affectedPersonIds) {
      const remainingFaces = await Face.countDocuments({ personId });
      if (remainingFaces === 0) {
        await Person.findByIdAndDelete(personId);
        console.log(`Deleted Person ${personId} with no remaining faces`);
      }
    }

    res.json({
      success: true,
      deletedFaces: facesToDelete.length,
      deletedFile: fileName,
      deletedPersons: affectedPersonIds.length,
    });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ message: "Failed to delete photo" });
  }
};
