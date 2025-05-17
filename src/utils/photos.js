import fs from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import heicConvert from "heic-convert";
import { execFile } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { promisify } from "util";

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
