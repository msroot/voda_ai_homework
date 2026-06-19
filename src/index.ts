import "dotenv/config";
import express from "express";
import pool from "./db.js";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import userRoutes from "./routes/users.js";
import assetRoutes from "./routes/assets.js";
import reportRoutes from "./routes/reports.js";
import { requireAuthUnlessPublic } from "./middleware/auth.js";
import { AppError } from "./errors/appError.js";
import { runSeed } from "../seed/index.js";

const app = express();
const port = process.env.PORT ?? 3000;

app.use(express.json());
app.use(requireAuthUnlessPublic);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/tenants", tenantRoutes);
app.use("/users", userRoutes);
app.use("/assets", assetRoutes);
app.use("/reports", reportRoutes);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json(
        err.details !== undefined
          ? { error: err.message, details: err.details }
          : { error: err.message }
      );
      return;
    }

    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

async function start() {
  if (process.env.SEED_ON_START === "true") {
    await runSeed();
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
