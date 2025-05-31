import mongoose, { Schema } from "mongoose";

const UploadStatusSchema = new Schema(
  {
    uploadId: { type: String, required: true, unique: true },
    uploaderEmail: { type: String, required: true },
    weddingName: { type: String, required: true },
    totalFiles: { type: Number, required: true },
    processedFiles: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    error: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("UploadStatus", UploadStatusSchema);
