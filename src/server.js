import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import router from "./routes/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

app.use(
  cors({
    origin: "*",
    // origin: [
    //   "https://wedding-memory-client.vercel.app",
    //   "http://localhost:3000",
    // ],
    methods: ["GET", "POST", "DELETE"],
    credentials: false,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

app.get("/", (req, res) => res.send("Express on Vercel"));
app.use("/api", router);

app.get("/api/files", async (req, res) => {
  const response = await drive.files.list({
    q: `${FOLDER_ID} in parents and trashed = false`,
    fields: "files(id, name, mimeType, webViewLink, thumbnailLink)",
  });
  res.json(response.data.files);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
