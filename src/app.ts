import express from "express";
import authRoutes from "./routes/auth.js";
import tenantRoutes from "./routes/tenants.js";
import userRoutes from "./routes/users.js";
import assetRoutes from "./routes/assets.js";
import reportRoutes from "./routes/reports.js";
import { requireAuthUnlessPublic } from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { AppError } from "./lib/appError.js";
import { finalizeIdempotencyOnError } from "./middleware/idempotency.js";

// Builds the Express app without starting a server, so it can be mounted both by
// the real entry point (src/index.ts) and by integration tests (supertest).
export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(requireAuthUnlessPublic);
  app.use(rateLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRoutes);
  app.use("/tenants", tenantRoutes);
  app.use("/users", userRoutes);
  app.use("/assets", assetRoutes);
  app.use("/reports", reportRoutes);

  app.use(
    async (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      await finalizeIdempotencyOnError(req, err);

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

  return app;
}
