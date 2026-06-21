import "dotenv/config";
import {
  claimPendingAssets,
  recoverStuckProcessing,
  releasePendingClaim,
} from "./repositories/assetRepository.js";
import { enqueueSyncAsset } from "./worker/syncAsset.js";

const POLL_INTERVAL_MS = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);
const PROCESSING_STALE_SECONDS = Number(
  process.env.OUTBOX_PROCESSING_STALE_SECONDS ?? 300
);

async function poll() {
  const recovered = await recoverStuckProcessing(PROCESSING_STALE_SECONDS);
  if (recovered > 0) {
    console.log(`Outbox: recovered ${recovered} stuck processing asset(s)`);
  }

  const claimed = await claimPendingAssets(BATCH_SIZE);
  let enqueued = 0;

  for (const asset of claimed) {
    try {
      await enqueueSyncAsset({
        assetId: asset.id,
        tenantId: asset.tenant_id,
        userId: asset.modified_by,
      });
      enqueued++;
    } catch (err) {
      console.error(`Outbox: enqueue failed for asset ${asset.id}`, err);
      await releasePendingClaim(asset.id);
    }
  }

  if (enqueued > 0) {
    console.log(`Outbox: enqueued ${enqueued} processing asset(s)`);
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
