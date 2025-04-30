import * as express from "express";
import telegramStorageRoutes from "./telegramStorage.js";

const router = express.Router();

router.use("/telegram-storage", telegramStorageRoutes);

export default router;
