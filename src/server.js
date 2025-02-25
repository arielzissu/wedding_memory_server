// import express from "express";
// import path from "path";
// import cors from "cors";
// import dotenv from "dotenv";
// import { PORT, PUBLIC_URL } from "./constants";

// app.use(
//   PUBLIC_URL,
//   express.static(path.resolve(__dirname, "../../public"), { maxAge: "1y" })
// );

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
// import router from "@routes";
import router from "./routes/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => res.send("Express on Vercel"));
app.use("/api", router);

// if (process.env.NODE_ENV !== "production") {
app.listen(PORT, () => console.log(`Server running locally on port: ${PORT}`));
// }
