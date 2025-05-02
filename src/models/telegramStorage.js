// models/Media.js
import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    fileId: String,
    publicId: String,
    type: String,
    caption: String,
    messageId: Number,
    uploadCreator: String,
    thumbnail: String,
    url: String,
    folder: String,
  },
  { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
