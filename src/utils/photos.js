import fs from "fs";
import { promises as fsPromise } from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import heicConvert from "heic-convert";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";

const execFileAsync = promisify(execFile);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const extractVideoThumbnail = (buffer, fileName) => {
  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${Date.now()}-${fileName}`);
    const thumbPath = inputPath.replace(path.extname(fileName), ".jpg");

    fs.writeFileSync(inputPath, buffer);

    ffmpeg(inputPath)
      .screenshots({
        timestamps: ["50%"],
        filename: path.basename(thumbPath),
        folder: tmpDir,
        size: "320x240",
      })
      .on("end", () => {
        resolve({
          thumbPath,
          thumbBuffer: fs.readFileSync(thumbPath),
          cleanup: () => {
            if (fs.existsSync(inputPath)) {
              fs.unlinkSync(inputPath);
            }
            if (fs.existsSync(thumbPath)) {
              fs.unlinkSync(thumbPath);
            }
          },
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};

export const convertHeicToJpeg = async (buffer) => {
  const outputBuffer = await heicConvert({
    buffer,
    format: "JPEG",
    quality: 1,
  });

  return outputBuffer;
};

export const compressVideoBuffer = async (buffer, originalName) => {
  const inputPath = path.join("/tmp", `${Date.now()}-${originalName}`);
  const outputPath = inputPath.replace(/\.\w+$/, "-compressed.mp4");

  fs.writeFileSync(inputPath, buffer);

  await execFileAsync(ffmpegPath, [
    "-i",
    inputPath,
    "-vcodec",
    "libx264",
    "-crf",
    "28", // Higher CRF = smaller file, 28 is decent
    "-preset",
    "ultrafast",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  const compressedBuffer = fs.readFileSync(outputPath);
  if (fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath);
  }
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  return compressedBuffer;
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
