import express from "express";
import multer from "multer";
import { deletePhoto, getPhotos, uploadImages } from "../controllers/index.js";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.get("/photos", getPhotos);
router.post("/upload", upload.array("photos"), uploadImages);
router.delete("/photo", deletePhoto); // TODO: Validate route by google token

export default router;
