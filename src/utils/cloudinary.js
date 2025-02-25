import dotenv from "dotenv";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { v2 as cloudinary } from "cloudinary";

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
      allowed_formats: [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "heic",
        "heif",
        "mp4",
        "avi",
        "3gp",
        "mkv",
        "MP4",
        "MOV",
        "AVI",
        "3GP",
        "MKV",
      ],
      resource_type: "auto",
    };
  },
});

export const getImagesByPath = async (path, options) => {
  const response = await cloudinary.api.resources_by_asset_folder(
    path,
    options
  );

  const resourcesWithThumbnails = response.resources.map((resource) => {
    if (resource.resource_type === "video") {
      return {
        ...resource,
        thumbnail_url: resource.secure_url.replace(
          "/upload/",
          "/upload/w_300,h_200,c_fill,f_jpg/"
        ),
      };
    }
    return resource;
  });

  return { resources: resourcesWithThumbnails };
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
