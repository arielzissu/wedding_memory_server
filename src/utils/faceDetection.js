import * as faceApi from "face-api.js";
import canvas from "canvas";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { v4 as uuidv4 } from "uuid";
import Person from "../models/Person.js";
import Face from "../models/Face.js";
import { MAX_DISTANCE_THRESHOLD } from "../constants/index.js";
import { tmpdir } from "os";

const MODEL_PATH = path.join(process.cwd(), "face-models");

const { Canvas, Image, ImageData, createCanvas, loadImage } = canvas;
faceApi.env.monkeyPatch({ Canvas, Image, ImageData });

export const loadModels = async () => {
  await faceApi.nets.tinyFaceDetector.loadFromDisk(
    path.join(MODEL_PATH, "tiny_face_detector")
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

  // Resize if needed
  const maxWidth = 640;
  const scale = img.width > maxWidth ? maxWidth / img.width : 1;
  const width = img.width * scale;
  const height = img.height * scale;

  const resizedCanvas = createCanvas(width, height);
  const ctx = resizedCanvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  const detections = await faceApi
    .detectAllFaces(resizedCanvas, new faceApi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptors();

  return detections.map((d) => ({
    descriptor: d.descriptor,
    box: {
      x: d.detection.box.x / scale,
      y: d.detection.box.y / scale,
      width: d.detection.box.width / scale,
      height: d.detection.box.height / scale,
    },
  }));
};

export const extractFramesFromVideo = (videoPath) => {
  return new Promise((resolve, reject) => {
    const outputDir = path.join(tmpdir(), `frames-${uuidv4()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPattern = path.join(outputDir, "frame-%03d.jpg");

    ffmpeg(videoPath)
      .outputOptions([
        "-vf",
        "fps=1", // 1 frame per second
        "-qscale:v",
        "2", // high quality
      ])
      .output(outputPattern)
      .on("end", () => {
        const frames = fs
          .readdirSync(outputDir)
          .map((f) => path.join(outputDir, f));
        resolve(frames);
      })
      .on("error", (err) => reject(err))
      .run();
  });
};

export const detectFacesFromVideo = async (videoBuffer, fileName) => {
  const videoPath = path.join("/tmp", `${Date.now()}-${fileName}`);
  fs.writeFileSync(videoPath, videoBuffer);

  const framePaths = await extractFramesFromVideo(videoPath);
  const allDetections = [];

  let cropSource = null;

  for (const framePath of framePaths) {
    try {
      const buffer = fs.readFileSync(framePath);
      const detections = await detectFacesFromImage(buffer);
      if (!cropSource && detections.length > 0) {
        cropSource = buffer;
      }
      allDetections.push(...detections);
    } catch (err) {
      console.warn("Skipping broken frame:", framePath, err.message);
    }
  }

  fs.unlinkSync(videoPath);
  framePaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p));

  return { faces: allDetections, cropSource };
};

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
