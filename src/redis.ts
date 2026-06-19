import IORedis from "ioredis";
import "dotenv/config";

export function createRedisConnection() {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}
