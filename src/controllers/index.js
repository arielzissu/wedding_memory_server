import dotenv from "dotenv";
import Media from "../../src/models/TelegramStorage.js";
import Face from "../../src/models/Face.js";
import Person from "../../src/models/Person.js";
import {
  getThumbUrl,
  getFileByFileId,
  // uploadTelegramMedia,
  deleteMediaByMessage,
  safeTelegramUpload,
} from "../utils/telegramStorageUtil.js";
import {
  detectFacesFromImage,
  detectFacesFromVideo,
  cropFace,
  matchPerson,
  normalizeDescriptor,
  updateAverageDescriptor,
} from "../utils/faceDetection.js";
import { groupFaces } from "../utils/groupFaces.js";
import { compressVideoBuffer, convertHeicToJpeg } from "../utils/photos.js";

dotenv.config();

export const uploadImages = async (req, res) => {
  try {
    const { uploadCreator, relevantFolder } = req.query;

    const uploadResults = await Promise.all(
      req.files.map(async (file) => {
        const isVideoType = file.mimetype.startsWith("video");

        let processedBuffer = file.buffer;
        let mimeType = file.mimetype;

        if (!isVideoType) {
          if (
            mimeType === "image/heic" ||
            file.originalname.toLowerCase().endsWith(".heic")
          ) {
            processedBuffer = await convertHeicToJpeg(file.buffer);
            mimeType = "image/jpeg";
          }
        }

        if (isVideoType && processedBuffer.length > 20 * 1024 * 1024) {
          processedBuffer = await compressVideoBuffer(
            file.buffer,
            file.originalname
          );
          mimeType = "video/quicktime";
        }

        if (processedBuffer.length > 50 * 1024 * 1024) {
          throw new Error(
            "Telegram upload failed: file is larger than 50MB limit."
          );
        }

        const telegramRes = await safeTelegramUpload({
          buffer: processedBuffer,
          fileName: file.originalname,
          mimeType,
          type: isVideoType ? "video" : "photo",
          caption: file.originalname,
        });

        const messageId = telegramRes.result.message_id;

        const fileId = isVideoType
          ? telegramRes.result.video?.file_id
          : telegramRes.result.photo?.at(-1)?.file_id;

        if (!fileId) {
          throw new Error("Could not extract fileId from Telegram response");
        }

        const { file_path } = await getFileByFileId(fileId);

        const thumbnailUrl = isVideoType
          ? await getThumbUrl(telegramRes.result.video?.thumb?.file_id)
          : null;

        const mediaItem = new Media({
          fileId,
          publicId: fileId,
          type: isVideoType ? "video" : "photo",
          caption: file.originalname,
          messageId,
          uploadCreator,
          thumbnail: thumbnailUrl || undefined,
          url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`,
          folder: relevantFolder,
        });

        await mediaItem.save();

        const faces = isVideoType
          ? await detectFacesFromVideo(processedBuffer, file.originalname)
          : await detectFacesFromImage(processedBuffer);

        // Process and save faces:
        await Promise.all(
          faces.map(async (face, i) => {
            const { descriptor, box } = face;

            let personId;

            // Crop the face preview
            const croppedBuffer = await cropFace(processedBuffer, {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            });

            const cropRes = await safeTelegramUpload({
              buffer: croppedBuffer,
              fileName: `face-${i}.jpg`,
              mimeType,
              type: "photo",
              caption: `Face #${i}`,
            });

            const cropFileId = isVideoType
              ? cropRes.result.video?.file_id
              : cropRes.result.photo?.at(-1)?.file_id;

            const { file_path: cropFilePath } = await getFileByFileId(
              cropFileId
            );
            const previewUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${cropFilePath}`;

            const normalizedDescriptor = normalizeDescriptor(descriptor);

            const person = await matchPerson(descriptor);
            if (person) {
              personId = person._id;
              // Optionally update that person's average descriptor using all their face descriptors
            } else {
              const newPerson = await Person.create({
                name: null,
                averageDescriptor: Array.from(normalizedDescriptor),
              });
              personId = newPerson._id;
            }

            const faceDoc = new Face({
              mediaId: mediaItem._id,
              descriptor: Array.from(normalizedDescriptor),
              position: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
              },
              thumbnailUrl: previewUrl,
              personId,
            });

            await faceDoc.save();
            await updateAverageDescriptor(personId);
          })
        );

        return mediaItem;
      })
    );

    await groupFaces();

    res.status(200).json(uploadResults);
  } catch (error) {
    console.error("Upload failed:", error.response?.data || error.message);
    res.status(500).json({ error: "Upload failed" });
  }
};

export const getPhotos = async (req, res) => {
  try {
    const { relevantFolder } = req.query;

    const filter = relevantFolder ? { folder: relevantFolder } : {};
    const storedMedia = await Media.find(filter).sort({ createdAt: -1 });

    if (!storedMedia || storedMedia.length === 0) {
      return res.status(200).json({ message: "No media found" });
    }

    const formattedMedia = storedMedia.map((item) => ({
      fileId: item.fileId,
      publicId: item.fileId,
      type: item.type,
      caption: item.caption || "",
      messageId: item.messageId,
      uploadCreator: item.uploadCreator,
      thumbnail: item.thumbnail || undefined,
      url: item.url,
    }));

    res.json(formattedMedia);
  } catch (err) {
    console.error("Error getting photos:", err);
    res.status(500).json({ message: "Failed to get photos" });
  }
};

export const getPeople = async (_req, res) => {
  const people = await Person.find();
  const result = await Promise.all(
    people.map(async (person) => {
      const faces = await Face.find({ personId: person._id }).populate(
        "mediaId"
      );
      return {
        personId: person._id,
        faceCount: faces.length,
        sampleThumbnail: faces[0]?.thumbnailUrl,
        mediaItems: faces.map((f) => f.mediaId),
      };
    })
  );

  res.json(result);
};

export const deletePhoto = async (req, res) => {
  try {
    const { messageId, userEmail } = req.body;

    const media = await Media.findOneAndDelete({
      messageId,
      uploadCreator: userEmail,
    });

    if (!media) {
      return res.status(404).json({ message: "Photo not found" });
    }

    // Step 2: Find all Faces linked to this Media (to get their personId)
    const facesToDelete = await Face.find({ mediaId: media._id });

    // Collect affected personIds (only if face has a personId)
    const affectedPersonIds = [
      ...new Set(
        facesToDelete.map((face) => face.personId?.toString()).filter(Boolean)
      ),
    ];

    // Step 3: Delete the Faces linked to this Media
    await Face.deleteMany({ mediaId: media._id });

    // Step 4: For each affected personId, delete Person if they have no remaining faces
    for (const personId of affectedPersonIds) {
      const remainingFaces = await Face.countDocuments({ personId });
      if (remainingFaces === 0) {
        await Person.findByIdAndDelete(personId);
        console.log(`Deleted Person ${personId} with no remaining faces`);
      }
    }

    // Step 5: Delete the media from Telegram
    const isDeleted = await deleteMediaByMessage(messageId);

    res.json({ success: isDeleted, message: "Photo deleted" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ message: "Failed to delete photo" });
  }
};
