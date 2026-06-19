import "dotenv/config";
import { createAssetSyncWorker } from "./queue/assetSyncWorker.js";
import { ensureAssetIndexes } from "./repositories/assetMongoRepository.js";
import { closeMongo } from "./mongo.js";

ensureAssetIndexes().catch((err) => {
  console.error("Failed to ensure Mongo asset indexes:", err);
});

const worker = createAssetSyncWorker();
console.log("Asset sync worker started");

async function shutdown() {
  await worker.close();
  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
