import * as express from "express";
import telegramStorageRoutes from "./telegramStorage.js";
import r2UploadRoutes from "./r2Upload.js";

const router = express.Router();

router.use("/telegram-storage", telegramStorageRoutes);
router.use("/r2", r2UploadRoutes);

export default router;
