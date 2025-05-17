import mongoose from "mongoose";

const faceSchema = new mongoose.Schema({
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: "Media", required: true },
  descriptor: { type: [Number], required: true }, // 128 floats
  position: {
    x: Number,
    y: Number,
    width: Number,
    height: Number
  },
  personId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null },
  createdAt: { type: Date, default: Date.now },
  thumbnailUrl: { type: String }
});

export default mongoose.model("Face", faceSchema);
