import express from "express";
import { getPeople } from "../controllers/index.js";

const router = express.Router();

router.get("/people", getPeople);
// router.get("/download-folder-assets", downloadFolderAssets);

export default router;
