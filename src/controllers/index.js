import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import {
  uploadMedia,
  uploadDirectory,
  getThumbUrl,
  getFileByFileId,
  deleteMediaByMessage,
} from "../utils/telegramStorageUtil.js";

dotenv.config();

const DB_PATH = path.join(process.cwd(), "telegramMedia.json");
const DOWNLOAD_BASE_DIR = path.join(process.cwd(), "downloads");

const saveMediaToDb = (data) => {
  let existing = [];
  if (fs.existsSync(DB_PATH)) {
    existing = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  }
  existing.push(...data);
  fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2));
};

export const uploadImages = async (req, res) => {
  try {
    const { uploadCreator, relevantFolder } = req.query;
    const uploadResults = [];

    if (req.files && req.files.length > 0) {
      await Promise.all(
        req.files.map(async (file) => {
          const filePath = file.path;
          const fileType = file.mimetype.startsWith("video")
            ? "video"
            : "image";

          const telegramRes = await uploadMedia(
            filePath,
            fileType,
            file.originalname
          );
          fs.unlinkSync(filePath);

          const fileId =
            telegramRes.photo?.at(-1)?.file_id ||
            telegramRes.video?.file_id ||
            telegramRes.document?.file_id;

          const thumbnailUrl = await getThumbUrl(
            telegramRes?.video?.thumb?.file_id
          );

          const { file_path } = await getFileByFileId(fileId);

          uploadResults.push({
            fileId,
            publicId: fileId,
            type: fileType,
            caption: telegramRes.caption,
            messageId: telegramRes.message_id,
            uploadCreator,
            thumbnail: thumbnailUrl,
            url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`,
          });
        })
      );

      saveMediaToDb(uploadResults);
    }

    // if (folderPath && fs.existsSync(folderPath)) {
    //   await uploadDirectory(folderPath, bulkType || "image");
    //   uploadResults.push({ bulkUpload: true, folderPath });
    // }

    res.json(uploadResults);
  } catch (err) {
    console.error("Telegram upload error:", err);
    res.status(500).send("Upload to Telegram failed");
  }
};

// ✅ List all stored media
export const getPhotos = async (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) return res.json([]);

    const rawData = fs.readFileSync(DB_PATH, "utf-8");
    const storedMedia = JSON.parse(rawData);

    const formatted = await Promise.all(
      storedMedia.map(async (item) => {
        const { file_path } = await getFileByFileId(item.fileId);
        return {
          fileId: item.fileId,
          publicId: item.fileId,
          type: item.type,
          caption: item.caption || "",
          messageId: item.messageId,
          uploadCreator: item.uploadCreator,
          thumbnail: item.thumbnail,
          url: `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`,
        };
      })
    );

    res.json(formatted.filter(Boolean));
  } catch (error) {
    console.error("Error fetching Telegram-stored media:", error);
    res.status(500).json({ message: "Failed to fetch photos" });
  }
};

export const downloadFolderAssets = async (req, res) => {
  const { folderPath } = req.query;

  try {
    if (!fs.existsSync(DB_PATH))
      return res.status(404).json({ message: "No media metadata found" });

    const mediaData = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    const matchedMedia = mediaData.filter(
      (item) => item.folderPath === folderPath
    );

    if (matchedMedia.length === 0) {
      return res
        .status(404)
        .json({ message: "No media found for this folder" });
    }

    const TelegramBot = (await import("node-telegram-bot-api")).default;
    const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

    const downloadPaths = [];

    for (const media of matchedMedia) {
      const { file_path } = await bot.getFile(media.fileId);
      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file_path}`;
      const fileName = `${media.messageId}_${media.fileType}_${media.fileName}`;
      const destPath = path.join(DOWNLOAD_BASE_DIR, folderPath, fileName);

      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const response = await axios.get(fileUrl, { responseType: "stream" });
      const writer = fs.createWriteStream(destPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      downloadPaths.push(destPath);
    }

    res.json({ downloadPath: downloadPaths });
  } catch (error) {
    console.error(`Error downloading Telegram folder [${folderPath}]:`, error);
    res.status(500).json({ message: "Failed to export Telegram folder" });
  }
};

const deletePhotoFromDb = (messageId, userEmail) => {
  const mediaList = fs.existsSync(DB_PATH)
    ? JSON.parse(fs.readFileSync(DB_PATH, "utf-8"))
    : [];

  const mediaItem = mediaList.find((item) => item.messageId === messageId && item.uploadCreator === userEmail);

  if (!mediaItem) {
    return { success: false, message: "Photo not found" };
  }

  const updatedMediaList = mediaList.filter(
    (item) => item.messageId !== messageId
  );

  fs.writeFileSync(DB_PATH, JSON.stringify(updatedMediaList, null, 2));
  return { success: true };
};

export const deletePhoto = async (req, res) => {
  try {
    const { messageId, userEmail } = req.body;
    if (!messageId) {
      return res.status(400).json({ message: "Message ID is required" });
    }
    const { success, message } = deletePhotoFromDb(messageId, userEmail);
    if (!success) {
      return res.status(404).json({ message });
    }
    const isDeleted = await deleteMediaByMessage(messageId);
    res.json({
      success: true,
      isDeleted,
      message: "Image has been deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image from Telegram bot:", error);
    res.status(500).json({ message: "Error deleting image" });
  }
};
