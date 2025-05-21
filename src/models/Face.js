import mongoose from "mongoose";

const faceSchema = new mongoose.Schema({
  mediaFileName: { type: String, required: true },
  descriptor: { type: [Number], required: true }, // 128 floats
  position: {
    x: Number,
    y: Number,
    width: Number,
    height: Number
  },
  personId: { type: mongoose.Schema.Types.ObjectId, ref: "Person", default: null },
  createdAt: { type: Date, default: Date.now },
  thumbnailUrl: { type: String },
  originalUrl: { type: String }
});

export default mongoose.model("Face", faceSchema);
