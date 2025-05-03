import dotenv from "dotenv";
import Media from "../models/telegramStorage.js";
import {
  getThumbUrl,
  getFileByFileId,
  uploadTelegramMedia,
  deleteMediaByMessage,
} from "../utils/telegramStorageUtil.js";

dotenv.config();

export const uploadImages = async (req, res) => {
  try {
    const { uploadCreator, relevantFolder } = req.query;

    const uploadResults = await Promise.all(
      req.files.map(async (file) => {
        const type = file.mimetype.startsWith("video") ? "video" : "photo";
        const isVideoType = type === "video";

        const telegramRes = await uploadTelegramMedia({
          buffer: file.buffer,
          fileName: file.originalname,
          mimeType: file.mimetype,
          type,
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
          ? await getThumbUrl(telegramRes.result.video?.file_id)
          : null;

        const mediaItem = new Media({
          fileId,
          publicId: fileId,
          type,
          caption: file.originalname,
          messageId,
          uploadCreator,
          thumbnail: thumbnailUrl || undefined,
          url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`,
          folder: relevantFolder,
        });

        await mediaItem.save();
        return mediaItem;
      })
    );

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
      return res.status(404).json({ message: "No media found" });
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

    const isDeleted = await deleteMediaByMessage(messageId);

    res.json({ success: isDeleted, message: "Photo deleted" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ message: "Failed to delete photo" });
  }
};
