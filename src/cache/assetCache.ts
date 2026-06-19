import { createHash } from "crypto";
import { createRedisConnection } from "../redis.js";
import type { AssetView } from "../repositories/assetMongoRepository.js";
import type { AssetFilter } from "../schemas.js";

const TTL_SECONDS = Number(process.env.ASSET_CACHE_TTL_SECONDS ?? 60);

// A single lazily-created client is reused for all cache operations.
let client: ReturnType<typeof createRedisConnection> | null = null;
function cache() {
  if (!client) {
    client = createRedisConnection();
  }
  return client;
}

// Stable hash of the request's query parameters (order-independent, undefined
// values dropped) so identical queries map to the same cache key.
function hashParams(params: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    if (params[key] !== undefined) {
      normalized[key] = params[key];
    }
  }
  return createHash("sha1").update(JSON.stringify(normalized)).digest("hex");
}

// Key format: tenant:{tenant_id}:{resource}:{query_parameters_hash}
// All keys for a tenant share the `tenant:{tenant_id}:` prefix so a single scan
// pattern can invalidate every cached read on a write.
function listKey(tenantId: string, filter: AssetFilter): string {
  return `tenant:${tenantId}:assets:${hashParams({
    type: filter.type,
    status: filter.status,
  })}`;
}

function itemKey(tenantId: string, id: string): string {
  return `tenant:${tenantId}:asset:${hashParams({ id })}`;
}

export async function getCachedAssetList(
  tenantId: string,
  filter: AssetFilter
): Promise<AssetView[] | null> {
  const raw = await cache().get(listKey(tenantId, filter));
  return raw ? (JSON.parse(raw) as AssetView[]) : null;
}

export async function setCachedAssetList(
  tenantId: string,
  filter: AssetFilter,
  assets: AssetView[]
): Promise<void> {
  await cache().set(
    listKey(tenantId, filter),
    JSON.stringify(assets),
    "EX",
    TTL_SECONDS
  );
}

export async function getCachedAsset(
  tenantId: string,
  id: string
): Promise<AssetView | null> {
  const raw = await cache().get(itemKey(tenantId, id));
  return raw ? (JSON.parse(raw) as AssetView) : null;
}

export async function setCachedAsset(
  tenantId: string,
  id: string,
  asset: AssetView
): Promise<void> {
  await cache().set(
    itemKey(tenantId, id),
    JSON.stringify(asset),
    "EX",
    TTL_SECONDS
  );
}

// Drops every cached list and item for the tenant. Called whenever an asset is
// created, updated, deleted, or synced to Mongo.
export async function invalidateTenantAssets(tenantId: string): Promise<void> {
  const c = cache();
  const pattern = `tenant:${tenantId}:*`;
  let cursor = "0";

  do {
    const [next, keys] = await c.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      await c.del(...keys);
    }
  } while (cursor !== "0");
}
