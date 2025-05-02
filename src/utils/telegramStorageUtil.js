import path from "path";
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN) {
  throw new Error("Missing TELEGRAM_TOKEN in environment");
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
// const bot = new TelegramBot(TELEGRAM_TOKEN, {
//   webHook: true,
// });
// bot.setWebHook(`${process.env.VERCEL_URL}/bot${TELEGRAM_TOKEN}`);

export const getFileByFileId = async (telegramFileId) => {
  if (!telegramFileId) return null;
  const telegramFile = await bot.getFile(telegramFileId);
  return telegramFile;
};

// export const getThumbUrl = async (videoFileId) => {
//   if (!videoFileId) return null;
//   const { file_path } = await getFileByFileId(videoFileId);
//   const thumbUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`;
//   return thumbUrl;
// };

// export const getThumbUrl = async (videoFileId) => {
//   if (!videoFileId) return null;
//   const { file_path } = await getFileByFileId(videoFileId);
//   const thumbUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`;

//   // Download the file and save it locally or to cloud storage
//   const localPath = `./uploads/${file_path.split("/").pop()}`;
//   const response = await axios({
//     url: thumbUrl,
//     method: "GET",
//     responseType: "stream",
//   });
//   response.data.pipe(fs.createWriteStream(localPath));

//   return localPath; // Return the local or cloud storage path
// };

export const getThumbUrl = async (videoFileId) => {
  if (!videoFileId) return null;

  const { file_path } = await getFileByFileId(videoFileId);
  console.log("file_path: ", file_path);
  const thumbUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file_path}`;

  const response = await axios({
    url: thumbUrl,
    method: "GET",
    responseType: "arraybuffer", // gets binary buffer
  });

  console.log("response: ", response);

  const buffer = Buffer.from(response.data);

  // Instead of returning a local path, return the buffer and filename
  return {
    filename: file_path.split("/").pop(),
    buffer,
  };
};

// Upload a single file (image/video)
export const uploadMedia = async (filePath, type = "image", caption = "") => {
  const method = type === "image" ? bot.sendPhoto : bot.sendVideo;
  return await method.call(bot, CHAT_ID, fs.createReadStream(filePath), {
    caption,
  });
};

// Upload all files in a directory (bulk)
export const uploadDirectory = async (dirPath, type = "image") => {
  let uploadResults = [];
  const files = fs.readdirSync(dirPath).filter((f) => !f.startsWith("."));
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const resUploadMedia = await uploadMedia(
      fullPath,
      type,
      `Uploaded: ${file}`
    );

    uploadResults.push({
      fileId,
      filePath,
      fileName: file.originalname,
      messageId: resUploadMedia.message_id,
      fileType,
      caption: resUploadMedia.caption,
      folderPath: req.body.folderPath || "default",
      uploadCreator,
      thumbnail: thumbnailUrl,
    });
  }

  return uploadResults;
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
    console.log(`Deleted message ${messageId} successfully`);
    return isDeleted;
  } catch (err) {
    console.error("Failed to delete message:", err);
  }
};
