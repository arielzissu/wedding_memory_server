import dotenv from "dotenv";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { VIDEO_EXTENSIONS } from "../constants/index.js";

dotenv.config();

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const listAllFiles = async (weddingName) => {
  const listCommand = new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME,
  });

  const response = await s3.send(listCommand);

  const files = await Promise.all(
    (response.Contents || []).map(async (file) => {
      const ext = path.extname(file.Key).toLowerCase();
      const isVideo = VIDEO_EXTENSIONS.includes(ext);

      let metadata = {};
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: file.Key,
        });
        const headResponse = await s3.send(headCommand);
        metadata = headResponse.Metadata || {};
      } catch (err) {
        console.error(`Failed to fetch metadata for ${file.Key}`, err);
      }

      if (
        metadata.is_thumbnail === "true" ||
        metadata.is_face === "true" ||
        metadata.wedding_name !== weddingName
      ) {
        return null;
      }

      return {
        fileName: file.Key,
        url: `${process.env.R2_BUCKET_URL}/${file.Key}`,
        type: isVideo ? "video" : "photo",
        metadata,
      };
    })
  );

  return files.filter(Boolean);
};

export const uploadToR2 = async (
  buffer,
  originalName,
  mimeType,
  uploadCreator,
  weddingName,
  customMetadata = {}
) => {
  const fileName = `${Date.now()}_${originalName}`;
  const fileExt = path.extname(fileName).toLowerCase();
  const isVideo = VIDEO_EXTENSIONS.includes(fileExt);

  const metadata = {
    uploader: uploadCreator || "",
    wedding_name: weddingName || "",
    ...customMetadata,
  };

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
    Metadata: metadata,
  });

  await s3.send(command);

  return {
    fileName,
    url: `${process.env.R2_BUCKET_URL}/${fileName}`,
    type: isVideo ? "video" : "photo",
    metadata: metadata,
  };
};

export const deleteFromR2 = async (fileName) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: fileName,
  });

  return await s3.send(command);
};
