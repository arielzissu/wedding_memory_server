import * as express from "express";
import r2UploadRoutes from "./r2Upload.js";

const router = express.Router();

router.use("/r2", r2UploadRoutes);

export default router;
