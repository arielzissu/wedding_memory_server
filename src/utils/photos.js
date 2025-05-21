import { promises as fsPromise } from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import heicConvert from "heic-convert";
import { v4 as uuidv4 } from "uuid";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const convertHeicToJpeg = async (buffer) => {
  const outputBuffer = await heicConvert({
    buffer,
    format: "JPEG",
    quality: 1,
  });

  return outputBuffer;
};

export const createThumbnailFromVideo = async (videoBuffer, originalName) => {
  const inputPath = path.join(os.tmpdir(), `${uuidv4()}_${originalName}`);
  const outputFileName = inputPath
    .replace(/\.\w+$/, ".jpg")
    .split("/")
    .pop();
  const outputPath = path.join(os.tmpdir(), outputFileName);

  await fsPromise.writeFile(inputPath, videoBuffer);

  await new Promise((resolve, reject) => {
    ffmpeg(inputPath).on("end", resolve).on("error", reject).screenshots({
      count: 1,
      folder: os.tmpdir(),
      filename: outputFileName,
      size: "320x?",
    });
  });

  const thumbBuffer = await fsPromise.readFile(outputPath);

  return {
    buffer: thumbBuffer,
    fileName: outputFileName,
  };
};
