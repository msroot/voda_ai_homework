import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createRedisConnection } from "../redis.js";
import { tryGetTenantId, tryGetUserId } from "../context/authContext.js";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 100);

// Dedicated Redis connection so the limiter is shared/consistent across every
// server process (the in-memory store would count each process separately).
const redis = createRedisConnection();

export const rateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:",
    sendCommand: (...args: string[]) =>
      redis.call(...args) as Promise<number | string | (number | string)[] | null>,
  }),
  // Authenticated requests are limited per user (this middleware runs inside the
  // auth context); public routes (e.g. login) fall back to a per-IP limit.
  keyGenerator: (req) => {
    const userId = tryGetUserId();
    if (userId) {
      return `user:${tryGetTenantId() ?? "none"}:${userId}`;
    }
    return `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  skip: (req) => req.path === "/health",
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many requests, please try again later" });
  },
});

// Closes the limiter's Redis connection so the process (and tests) can exit.
export async function closeRateLimiter(): Promise<void> {
  await redis.quit();
}
