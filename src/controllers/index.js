import {
  deleteFromCloudinary,
  fetchResourcesByPath,
  fetchResourcesByUploadCreator,
  getFolderPathByRelevantFolder,
  uploadToCloudinary,
} from "../utils/cloudinary.js";

export const uploadImages = async (req, res) => {
  const { uploadCreator, relevantFolder } = req.query;
  try {
    const imagePaths = [];
    for (const file of req.files) {
      const filePath = file.path;
      const fileType = file.mimetype.split("/")[0];

      const result = await uploadToCloudinary(filePath, {
        folder: getFolderPathByRelevantFolder(relevantFolder),
        tags: [uploadCreator],
        resource_type: fileType,
      });

      imagePaths.push({
        url: result.secure_url,
        publicId: result.public_id,
        type: result.resource_type,
      });
    }

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
        const formattedAsset = {
          url: asset.secure_url,
          publicId: asset.public_id,
          type: asset.resource_type,
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
    res.status(500).json({ message: "Error fetching images" });
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
