import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app.js";
import { closeSeedConnections, runSeed } from "../seed/index.js";
import pool, { queryWithoutTenantContext } from "../src/clients/postgres.js";
import { closeMongo } from "../src/clients/mongo.js";
import { closeCache } from "../src/lib/cache.js";
import { closeRateLimiter } from "../src/middleware/rateLimit.js";
import { runWithAuthContext } from "../src/lib/authContext.js";
import {
  claimPendingAssets,
  markAssetFailed,
  markAssetSynced,
  recoverStuckProcessing,
  releasePendingClaim,
} from "../src/repositories/assetRepository.js";

const app = createApp();

const PASSWORD = process.env.SEED_PASSWORD ?? "password123";
const TENANT_A = "11111111-1111-4111-8111-111111111111";
const ADMIN_A = "bdd640fb-0667-4ad1-9c80-317fa3b1799d";
const EDITOR_A = "23b8c1e9-3924-46de-beb1-3b9046685257";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function createPendingAsset(token: string): Promise<string> {
  const res = await request(app)
    .post("/assets")
    .set(auth(token))
    .set("Idempotency-Key", randomUUID())
    .send({
      name: `OUTBOX-${randomUUID().slice(0, 8)}`,
      type: "sensor",
      status: "ok",
      lat: 42.1,
      lng: -71.1,
      installed_at: "2020-01-01",
      material: "copper",
      diameter_mm: 100,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function getSyncStatus(assetId: string): Promise<string> {
  const { rows } = await queryWithoutTenantContext<{ status: string }>(
    "SELECT status FROM assets WHERE id = $1",
    [assetId]
  );
  return rows[0]?.status ?? "";
}

let editorToken: string;

beforeAll(async () => {
  await runSeed();
  editorToken = await login("sam@northwind.test");
});

afterAll(async () => {
  await Promise.allSettled([
    pool.end(),
    closeSeedConnections(),
    closeMongo(),
    closeCache(),
    closeRateLimiter(),
  ]);
});

describe("outbox claim", () => {
  it("claims pending rows in one transaction (status -> processing)", async () => {
    const assetId = await createPendingAsset(editorToken);
    expect(await getSyncStatus(assetId)).toBe("pending");

    const claimed = await claimPendingAssets(50);
    const match = claimed.find((row) => row.id === assetId);
    expect(match).toBeDefined();
    expect(match?.tenant_id).toBe(TENANT_A);
    expect(await getSyncStatus(assetId)).toBe("processing");
  });

  it("parallel claims do not return the same asset", async () => {
    const ids = await Promise.all([
      createPendingAsset(editorToken),
      createPendingAsset(editorToken),
      createPendingAsset(editorToken),
      createPendingAsset(editorToken),
    ]);

    const [first, second] = await Promise.all([
      claimPendingAssets(2),
      claimPendingAssets(2),
    ]);

    const claimedIds = [...first, ...second].map((row) => row.id);
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds.filter((id) => ids.includes(id)).length).toBe(ids.length);
    for (const id of ids) {
      expect(await getSyncStatus(id)).toBe("processing");
    }
  });

  it("releasePendingClaim returns a row to pending after enqueue failure", async () => {
    const assetId = await createPendingAsset(editorToken);
    await claimPendingAssets(50);
    expect(await getSyncStatus(assetId)).toBe("processing");

    await releasePendingClaim(assetId);
    expect(await getSyncStatus(assetId)).toBe("pending");
  });

  it("recoverStuckProcessing resets old processing rows to pending", async () => {
    const assetId = await createPendingAsset(editorToken);
    await claimPendingAssets(50);

    await queryWithoutTenantContext(
      `UPDATE assets
          SET claimed_at = NOW() - interval '10 minutes'
        WHERE id = $1`,
      [assetId]
    );

    const recovered = await recoverStuckProcessing(60);
    expect(recovered).toBeGreaterThanOrEqual(1);
    expect(await getSyncStatus(assetId)).toBe("pending");
  });

  it("markAssetSynced transitions processing -> synced", async () => {
    const assetId = await createPendingAsset(editorToken);
    await claimPendingAssets(50);

    await runWithAuthContext(
      { userId: ADMIN_A, tenantId: TENANT_A, role: "admin" },
      async () => {
        await markAssetSynced(assetId);
      }
    );

    expect(await getSyncStatus(assetId)).toBe("synced");
  });

  it("markAssetFailed transitions processing -> failed after max retries", async () => {
    const assetId = await createPendingAsset(editorToken);
    await claimPendingAssets(50);

    await runWithAuthContext(
      { userId: EDITOR_A, tenantId: TENANT_A, role: "editor" },
      async () => {
        await markAssetFailed(assetId);
      }
    );

    expect(await getSyncStatus(assetId)).toBe("failed");
  });
});
