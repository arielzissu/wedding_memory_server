import express from "express";
import multer from "multer";
import { getPhotos, uploadImages, deletePhoto } from "../controllers/index.js";

const router = express.Router();

// const upload = multer({ dest: "uploads/" });
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get("/photos", getPhotos);
router.post("/upload", upload.array("photos"), uploadImages);
router.delete("/photo", deletePhoto); // TODO: Validate route by google token
// router.get("/download-folder-assets", downloadFolderAssets);

export default router;
