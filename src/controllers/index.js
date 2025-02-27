import {
  deleteFromCloudinary,
  fetchResourcesByPath,
  fetchResourcesByUploadCreator,
  getFolderPathByRelevantFolder,
  uploadToCloudinary,
  exportCloudinaryFolder,
} from "../utils/cloudinary.js";

export const uploadImages = async (req, res) => {
  const { uploadCreator, relevantFolder } = req.query;

  try {
    const uploadPromises = req.files.map((file) => {
      const filePath = file.path;
      const fileType = file.mimetype.split("/")[0];

      return uploadToCloudinary(filePath, {
        folder: getFolderPathByRelevantFolder(relevantFolder),
        tags: [uploadCreator],
        resource_type: fileType,
      }).then((result) => ({
        url: result.secure_url.replace("/upload/", "/upload/f_auto/"),
        publicId: result.public_id,
        type: result.resource_type,
      }));
    });

    const imagePaths = await Promise.all(uploadPromises);

    res.json({
      message: "Images uploaded successfully!",
      imageUrls: imagePaths,
    });
  } catch (error) {
    console.error("Error uploading images to Cloudinary. error: ", error);
    res.status(500).json({ message: "Error uploading images" });
  }
};

export const getImages = async (req, res) => {
  const { uploadCreator, relevantFolder } = req.query;
  const fullPath = getFolderPathByRelevantFolder(relevantFolder);
  try {
    const options = {
      max_results: 50,
      prefix: fullPath,
      // next_cursor: nextCursor // TODO: handle pagination for all the images from the Cloudinary
    };

    let allAssets;
    if (uploadCreator) {
      allAssets = await fetchResourcesByUploadCreator(
        uploadCreator,
        fullPath,
        options
      );
    } else {
      allAssets = await fetchResourcesByPath(fullPath, options);
    }

    const { images, videos } = allAssets.resources.reduce(
      (acc, asset) => {
        const optimizedUrl = asset.secure_url.replace(
          "/upload/",
          "/upload/f_auto/"
        );
        const thumbnailUrl = asset.secure_url
          .replace("/upload/", "/upload/w_300,h_200,c_fill,f_auto/")
          .replace(/\.[^/.]+$/, ".jpg");

        const formattedAsset = {
          url: optimizedUrl,
          publicId: asset.public_id,
          type: asset.resource_type,
          thumbnail: thumbnailUrl,
        };

        if (asset.resource_type === "image") {
          acc.images.push(formattedAsset);
        } else {
          acc.videos.push(formattedAsset);
        }
        return acc;
      },
      { images: [], videos: [] }
    );

    res.json({ images, videos });
  } catch (error) {
    console.error("Error fetching images from Cloudinary:", error);
    res.status(500).json({ message: "Failed to fetching images" });
  }
};

export const downloadFolderAssets = async (req, res) => {
  const { folderPath } = req.query;
  const fullPath = getFolderPathByRelevantFolder(folderPath);
  try {
    const { downloadPath } = await exportCloudinaryFolder(fullPath);
    res.json({ downloadPath });
  } catch (error) {
    console.error(
      `Error export Cloudinary folder. [fullPath=${fullPath}]`,
      error
    );
    res.status(500).json({ message: "Failed to export Cloudinary folder" });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;
    await deleteFromCloudinary(publicId, resourceType);
    res.json({
      success: true,
      message: "Image has been deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
    res.status(500).json({ message: "Error deleting image" });
  }
};
