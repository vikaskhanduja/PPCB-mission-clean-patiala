import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";
import { connect, seed } from "./src/db.js";
import { router } from "./src/routes.js";

const app = express();

// Allow GitHub Pages frontend + local dev

const allowedOrigins = [
  /^https:\/\/[\w-]+\.github\.io$/,
  "https://ppcbmissioncleanpatiala.in",
  "https://www.ppcbmissioncleanpatiala.in",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some((o) =>
      typeof o === "string" ? o === origin : o.test(origin),
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
};

app.use(helmet({ contentSecurityPolicy: false }));

// app.use(cors) automatically handles OPTIONS preflight — no app.options() needed.
// (Express 5 / path-to-regexp v8 no longer supports the bare '*' wildcard in routes)
app.use(cors(corsOptions));

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/api", router);
app.get("/health", (req, res) =>
  res.json({ status: "ok", database: "mongodb" }),
);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

await connect();
await seed();
const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Mission Clean Patiala API running on http://localhost:${port}`),
);
