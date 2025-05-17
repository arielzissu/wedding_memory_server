import * as faceApi from "face-api.js";
import canvas from "canvas";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { v4 as uuidv4 } from "uuid";
import Person from "../models/Person.js";
import Face from "../models/Face.js";
import { MAX_DISTANCE_THRESHOLD } from "../constants/index.js";

const MODEL_PATH = path.join(process.cwd(), "face-models");

const { Canvas, Image, ImageData, createCanvas, loadImage } = canvas;
faceApi.env.monkeyPatch({ Canvas, Image, ImageData });

export const loadModels = async () => {
  await faceApi.nets.ssdMobilenetv1.loadFromDisk(
    path.join(MODEL_PATH, "ssd_mobilenetv1")
  );
  await faceApi.nets.faceLandmark68Net.loadFromDisk(
    path.join(MODEL_PATH, "face_landmark_68")
  );
  await faceApi.nets.faceRecognitionNet.loadFromDisk(
    path.join(MODEL_PATH, "face_recognition")
  );
};

export const detectFacesFromImage = async (imageBuffer) => {
  const img = await canvas.loadImage(imageBuffer);
  const detections = await faceApi
    .detectAllFaces(img)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => ({
    descriptor: d.descriptor,
    box: d.detection.box,
  }));
};

export const extractFramesFromVideo = (videoPath, frameCount = 3) => {
  return new Promise((resolve, reject) => {
    const outputDir = path.join("/tmp", uuidv4());
    fs.mkdirSync(outputDir, { recursive: true });

    ffmpeg(videoPath)
      .on("end", () => {
        const frames = fs
          .readdirSync(outputDir)
          .filter((f) => f.endsWith(".jpg"));
        if (frames.length === 0) {
          throw new Error("No valid image frames extracted from video");
        }
        resolve(frames);
      })
      .on("error", reject)
      .screenshots({
        count: frameCount,
        folder: outputDir,
        filename: "frame-%i.jpg",
        size: "320x240",
      });
  });
};

export const detectFacesFromVideo = async (videoBuffer, fileName) => {
  const videoPath = path.join("/tmp", `${Date.now()}-${fileName}`);
  fs.writeFileSync(videoPath, videoBuffer);

  const framePaths = await extractFramesFromVideo(videoPath);
  const allDetections = [];

  for (const framePath of framePaths) {
    try {
      const buffer = fs.readFileSync(framePath);
      const detections = await detectFacesFromImage(buffer);
      allDetections.push(...detections);
    } catch (err) {
      console.warn("Skipping broken frame:", framePath, err.message);
    }
  }

  if (fs.existsSync(videoPath)) {
    fs.unlinkSync(videoPath);
  }

  framePaths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  });

  return allDetections;
};

// export const cropFace = async (imageBuffer, box) => {
//   const img = await loadImage(imageBuffer);
//   const canvas = createCanvas(box.width, box.height);
//   const ctx = canvas.getContext("2d");

//   ctx.drawImage(
//     img,
//     box.x,
//     box.y,
//     box.width,
//     box.height,
//     0,
//     0,
//     box.width,
//     box.height
//   );

//   return canvas.toBuffer("image/jpeg");
// };
export const cropFace = async (imageBuffer, box, paddingRatio = 0.3) => {
  const img = await loadImage(imageBuffer);
  const imageWidth = img.width;
  const imageHeight = img.height;

  // Expand box
  const padX = box.width * paddingRatio;
  const padY = box.height * paddingRatio;

  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const width = Math.min(imageWidth - x, box.width + padX * 2);
  const height = Math.min(imageHeight - y, box.height + padY * 2);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(
    img,
    x,
    y,
    width,
    height, // source from original image
    0,
    0,
    width,
    height // draw on canvas
  );

  return canvas.toBuffer("image/jpeg");
};

// Compare new descriptor against known persons
export const matchPerson = async (descriptor) => {
  const persons = await Person.find();

  for (const person of persons) {
    const avgDescriptor = person.averageDescriptor;
    const distance = faceApi.euclideanDistance(descriptor, avgDescriptor);

    if (distance < MAX_DISTANCE_THRESHOLD) {
      return person;
    }
  }

  return null;
};

export const updateAverageDescriptor = async (personId) => {
  const faces = await Face.find({ personId });
  if (!faces.length) return;

  const sum = new Array(faces[0].descriptor.length).fill(0);
  faces.forEach((face) => {
    face.descriptor.forEach((val, i) => {
      sum[i] += val;
    });
  });

  const avg = sum.map((val) => val / faces.length);
  await Person.findByIdAndUpdate(personId, {
    averageDescriptor: Array.from(avg),
  });
};

export const normalizeDescriptor = (desc) => {
  const norm = Math.sqrt(desc.reduce((sum, val) => sum + val ** 2, 0));
  return desc.map((val) => val / norm);
};
