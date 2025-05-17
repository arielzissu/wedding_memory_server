import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";
import { extractVideoThumbnail } from "../utils/photos.js";

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN) {
  throw new Error("Missing TELEGRAM_TOKEN in environment");
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

export const getFileByFileId = async (telegramFileId) => {
  if (!telegramFileId) return null;
  const telegramFile = await bot.getFile(telegramFileId);
  return telegramFile;
};

export const getThumbUrl = async (videoFileId) => {
  if (!videoFileId) return null;
  const { file_path } = await getFileByFileId(videoFileId);
  const thumbUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`;
  return thumbUrl;
};

export const uploadTelegramMedia = async ({
  buffer,
  fileName,
  mimeType,
  type = "photo",
  caption = "",
}) => {
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  form.append("caption", caption);

  if (type === "video") {
    const { thumbPath, cleanup } = await extractVideoThumbnail(
      buffer,
      fileName
    );
    try {
      form.append("video", buffer, {
        filename: fileName,
        contentType: mimeType,
      });

      form.append("thumb", fs.createReadStream(thumbPath));

      const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendVideo`;

      const response = await axios.post(telegramUrl, form, {
        headers: form.getHeaders(),
      });

      cleanup();
      return response.data;
    } finally {
      cleanup();
    }
  }

  // Fallback for photos
  form.append("photo", buffer, {
    filename: fileName,
    contentType: mimeType,
  });

  const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendPhoto`;

  const response = await axios.post(telegramUrl, form, {
    headers: form.getHeaders(),
  });

  return response.data;
};

export const downloadFile = async (fileId, downloadPath) => {
  if (!fileId || !downloadPath) {
    throw new Error(
      "fileId and downloadPath are required to download and save a file"
    );
  }
  const { file_path } = await getFileByFileId(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file_path}`;

  const writer = fs.createWriteStream(downloadPath);
  const response = await axios.get(fileUrl, { responseType: "stream" });
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(downloadPath));
    writer.on("error", reject);
  });
};

export const deleteMediaByMessage = async (messageId) => {
  try {
    const isDeleted = await bot.deleteMessage(CHAT_ID, messageId);
    return isDeleted;
  } catch (err) {
    console.error("Failed to delete message:", err);
  }
};

export const safeTelegramUpload = async ({
  buffer,
  fileName,
  mimeType,
  type = "photo",
  caption = "",
}) => {
  console.log("buffer: ", buffer);
  const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
  console.log(`Uploading to Telegram: ${fileName} (${sizeMB} MB)`);

  if (buffer.length > 50 * 1024 * 1024) {
    throw new Error(`Telegram upload failed: ${fileName} exceeds 50MB`);
  }

  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append("caption", caption || fileName);

  if (type === "video") {
    let thumbPath = null;
    let cleanup = () => {};

    try {
      // Optional: generate a thumbnail if needed
      const thumbResult = await extractVideoThumbnail(buffer, fileName);
      thumbPath = thumbResult.thumbPath;
      cleanup = thumbResult.cleanup;

      form.append("video", buffer, {
        filename: fileName,
        contentType: mimeType,
      });

      form.append("thumb", fs.createReadStream(thumbPath));
    } catch (err) {
      console.warn("Skipping thumbnail due to error:", err.message);
      form.append("video", buffer, {
        filename: fileName,
        contentType: mimeType,
      });
    }

    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`,
      form,
      { headers: form.getHeaders() }
    );

    cleanup?.();
    return response.data;
  }

  // Handle photo
  form.append("photo", buffer, {
    filename: fileName,
    contentType: mimeType,
  });

  const response = await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
    form,
    { headers: form.getHeaders() }
  );

  return response.data;
};
