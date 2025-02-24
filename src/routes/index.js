import * as express from "express";
import cloudinaryRoutes from "./cloudinary.js";

const router = express.Router();

router.use("/cloudinary", cloudinaryRoutes);

export default router;
