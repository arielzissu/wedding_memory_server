import fs from "fs";
import path from "path";
import os from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

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
            fs.unlinkSync(inputPath);
            fs.unlinkSync(thumbPath);
          },
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
};
