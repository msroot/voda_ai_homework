import "dotenv/config";
import express from "express";
import pool from "./db.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import userRoutes from "./routes/users.js";
import assetRoutes from "./routes/assets.js";
import { authenticate } from "./middleware/auth.js";
import { runSeed } from "../seed/index.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);

app.use(authenticate);
app.use("/tenants", tenantRoutes);
app.use("/users", userRoutes);
app.use("/assets", assetRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

async function start() {
  await runSeed();

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
