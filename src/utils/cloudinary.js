import dotenv from "dotenv";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import axios from "axios";
import path from "path";
import os from "os";
import { SUPPORTED_MEDIA_FORMATS } from "../constants/index.js";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    return {
      allowed_formats: SUPPORTED_MEDIA_FORMATS,
      resource_type: "auto",
    };
  },
});

export const getImagesByPath = async (path, options) => {
  return await cloudinary.api.resources_by_asset_folder(path, {
    ...options,
    tags: true,
  });
};

export const getImagesByTag = async (tag, path, options) => {
  const folderResponse = await getImagesByPath(path, {
    ...options,
    tags: true,
  });
  const filteredResources = folderResponse.resources.filter((resource) => {
    return resource.tags && resource.tags.includes(tag);
  });
  return { resources: filteredResources };
};

export const uploadToCloudinary = async (filePath, options = {}) => {
  return cloudinary.uploader.upload_large(filePath, {
    chunk_size: 10000000, // 10MB chunks for faster uploads
    timeout: 600000,
    use_filename: true, // Keep original file name
    unique_filename: false, // Don't rename files
    tags: true,
    ...options,
  });
};

export const deleteFromCloudinary = async (publicId, resourceType) => {
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

export const fetchResourcesByPath = async (path, options) => {
  return await getImagesByPath(path, options);
};

export const fetchResourcesByUploadCreator = async (
  uploadCreator,
  relevantFolder,
  options
) => {
  return await getImagesByTag(uploadCreator, relevantFolder, options);
};

export const getFolderPathByRelevantFolder = (relevantFolder) => {
  return `wedding/${relevantFolder}`;
};

const fetchCloudinaryResources = async (
  folderPath,
  resourceType,
  nextCursor = null
) => {
  try {
    const options = {
      type: "upload",
      prefix: folderPath,
      max_results: 100,
      resource_type: resourceType,
    };

    if (nextCursor) options.next_cursor = nextCursor;

    const response = await cloudinary.api.resources(options);
    console.log(`Fetched ${resourceType}:`, response);
    return response;
  } catch (error) {
    console.error(`❌ Error fetching ${resourceType}:`, error);
  }
};

export const fetchAllAssets = async (folderPath, nextCursor = null) => {
  const images = await fetchCloudinaryResources(
    folderPath,
    "image",
    nextCursor
  );
  const videos = await fetchCloudinaryResources(
    folderPath,
    "video",
    nextCursor
  );
  const combineNextCursor = images.next_cursor || videos.next_cursor || null;
  const combineResources = [...images.resources, ...videos.resources];
  return { resources: combineResources, next_cursor: combineNextCursor };
};

export const downloadFile = async (url, filename, downloadDir) => {
  try {
    const safeFilename = path.basename(filename);
    const filePath = path.resolve(downloadDir, safeFilename);

    console.log(`📥 Downloading: ${url} -> ${filePath}`);

    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
      console.log(`📁 Created directory: ${downloadDir}`);
    }

    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        console.log(`✅ File saved: ${filePath}`);
        resolve(filePath);
      });
      writer.on("error", (error) => {
        console.error(`❌ Error writing file: ${filePath}`, error);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`❌ Download failed for ${filename}:`, error.message);
    throw error;
  }
};

export const exportCloudinaryFolder = async (folderPath) => {
  let nextCursor = null;
  let count = 0;

  const downloadsDir = path.join(os.homedir(), "Downloads");
  const fullDownloadPath = path.join(downloadsDir, folderPath);

  if (!fs.existsSync(fullDownloadPath)) {
    fs.mkdirSync(fullDownloadPath, { recursive: true });
  }

  console.log(`Downloading to: ${fullDownloadPath}`);

  do {
    const assetsResponse = await fetchAllAssets(folderPath, nextCursor);
    if (!assetsResponse || !assetsResponse.resources) break;

    const downloadPromises = assetsResponse.resources.map((asset) => {
      const fileUrl = asset.secure_url;
      const filename = `${asset.public_id}.${asset.format}`;
      count++;
      return downloadFile(fileUrl, filename, fullDownloadPath);
    });

    await Promise.all(downloadPromises);

    nextCursor = assetsResponse.next_cursor;
  } while (nextCursor);

  console.log(
    `✅ Download complete! ${count} files saved in ${fullDownloadPath}`
  );

  return { success: true, downloadPath: fullDownloadPath };
};
