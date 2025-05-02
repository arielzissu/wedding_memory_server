import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import router from "./routes/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "*", // or "https://wedding-memory-client.vercel.app"
    methods: ["GET", "POST", "DELETE"],
    credentials: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
