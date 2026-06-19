import "dotenv/config";
import { findPendingAssets } from "./repositories/assetRepository.js";
import { enqueueAssetSync } from "./queue/assetSyncQueue.js";

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);

async function poll() {
  const pending = await findPendingAssets(BATCH_SIZE);

  for (const asset of pending) {
    await enqueueAssetSync({
      assetId: asset.id,
      tenantId: asset.tenant_id,
      userId: asset.created_by,
    });
  }

  if (pending.length > 0) {
    console.log(`Outbox: enqueued ${pending.length} pending asset(s)`);
  }
}

async function loop() {
  console.log(
    `Outbox listener polling every ${POLL_INTERVAL_MS}ms (batch ${BATCH_SIZE})`
  );

  for (;;) {
    try {
      await poll();
    } catch (err) {
      console.error("Outbox poll failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

loop();
