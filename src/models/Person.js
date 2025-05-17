import mongoose from "mongoose";

const personSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  averageDescriptor: { type: [Number], required: true },
  name: { type: String, default: null },
});

export default mongoose.model("Person", personSchema);
