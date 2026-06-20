import "dotenv/config";
import pool from "./db.js";
import { createApp } from "./app.js";
import { ensureAssetIndexes } from "./repositories/assetMongoRepository.js";
import { runSeed } from "../seed/index.js";

const app = createApp();
const port = process.env.PORT ?? 3000;

async function start() {
  if (process.env.SEED_ON_START === "true") {
    await runSeed();
  }

  try {
    await ensureAssetIndexes();
  } catch (err) {
    console.error("Failed to ensure Mongo asset indexes:", err);
  }

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  pool.end().finally(() => process.exit(1));
});
