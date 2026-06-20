import { createHash } from "crypto";
import { createRedisConnection } from "../redis.js";

const TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 60);

// A single lazily-created client is reused for all cache operations.
let client: ReturnType<typeof createRedisConnection> | null = null;
function cache() {
  if (!client) {
    client = createRedisConnection();
  }
  return client;
}

// Stable hash of a request's query parameters (order-independent, undefined
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
export function cacheKey(
  tenantId: string,
  resource: string,
  params: Record<string, unknown>
): string {
  return `tenant:${tenantId}:${resource}:${hashParams(params)}`;
}

// Closes the cache connection. Used by tests (and any graceful shutdown) so the
// process can exit without a dangling Redis handle.
export async function closeCache(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  const raw = await cache().get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setCached(key: string, value: unknown): Promise<void> {
  await cache().set(key, JSON.stringify(value), "EX", TTL_SECONDS);
}

// Write-invalidate: drops every cached entry for a tenant's resource so the next
// read repopulates from the database with fresh data.
export async function invalidateResource(
  tenantId: string,
  resource: string
): Promise<void> {
  const c = cache();
  const pattern = `tenant:${tenantId}:${resource}:*`;
  let cursor = "0";

  do {
    const [next, keys] = await c.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      await c.del(...keys);
    }
  } while (cursor !== "0");
}
