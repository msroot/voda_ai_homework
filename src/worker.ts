import "dotenv/config";
import { createAssetSyncWorker } from "./queue/assetSyncWorker.js";
import { closeMongo } from "./mongo.js";

const worker = createAssetSyncWorker();
console.log("Asset sync worker started");

async function shutdown() {
  await worker.close();
  await closeMongo();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
