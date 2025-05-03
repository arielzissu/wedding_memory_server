import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";

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

  // const response = await axios({
  //   url: thumbUrl,
  //   method: "GET",
  //   responseType: "arraybuffer",
  // });

  // const buffer = Buffer.from(response.data);

  // return {
  //   filename: file_path.split("/").pop(),
  //   buffer,
  // };
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
  form.append(type, buffer, {
    filename: fileName,
    contentType: mimeType,
  });

  const fileTypeUrl = type[0].toUpperCase() + type.slice(1);
  const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/send${fileTypeUrl}`;

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
