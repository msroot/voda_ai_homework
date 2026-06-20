import { createHash } from "crypto";
import { createRedisConnection } from "./clients/redis.js";
import type { AssetResponse, UserResponse } from "./responses.js";
import type { AssetFilter, Pagination } from "./schemas.js";
import type { Paginated } from "./types.js";

const TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 60);

let client: ReturnType<typeof createRedisConnection> | null = null;
function redis() {
  if (!client) {
    client = createRedisConnection();
  }
  return client;
}

function hashParams(params: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(params).sort()) {
    if (params[key] !== undefined) {
      normalized[key] = params[key];
    }
  }
  return createHash("sha1").update(JSON.stringify(normalized)).digest("hex");
}

export function cacheKey(
  tenantId: string,
  resource: string,
  params: Record<string, unknown>
): string {
  return `tenant:${tenantId}:${resource}:${hashParams(params)}`;
}

export async function closeCache(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  const raw = await redis().get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setCached(key: string, value: unknown): Promise<void> {
  await redis().set(key, JSON.stringify(value), "EX", TTL_SECONDS);
}

export async function invalidateResource(
  tenantId: string,
  resource: string
): Promise<void> {
  const c = redis();
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

const ASSETS = "assets";
const USERS = "users";

function assetListParams(filter: AssetFilter): Record<string, unknown> {
  return {
    type: filter.type,
    status: filter.status,
    limit: filter.limit,
    offset: filter.offset,
  };
}

export function getCachedAssetList(
  tenantId: string,
  filter: AssetFilter
): Promise<Paginated<AssetResponse> | null> {
  return getCached<Paginated<AssetResponse>>(
    cacheKey(tenantId, ASSETS, assetListParams(filter))
  );
}

export function setCachedAssetList(
  tenantId: string,
  filter: AssetFilter,
  assets: Paginated<AssetResponse>
): Promise<void> {
  return setCached(cacheKey(tenantId, ASSETS, assetListParams(filter)), assets);
}

export function getCachedAsset(
  tenantId: string,
  id: string
): Promise<AssetResponse | null> {
  return getCached<AssetResponse>(cacheKey(tenantId, ASSETS, { id }));
}

export function setCachedAsset(
  tenantId: string,
  id: string,
  asset: AssetResponse
): Promise<void> {
  return setCached(cacheKey(tenantId, ASSETS, { id }), asset);
}

export function invalidateTenantAssets(tenantId: string): Promise<void> {
  return invalidateResource(tenantId, ASSETS);
}

export function getCachedUserList(
  tenantId: string,
  pagination: Pagination
): Promise<Paginated<UserResponse> | null> {
  return getCached<Paginated<UserResponse>>(
    cacheKey(tenantId, USERS, {
      limit: pagination.limit,
      offset: pagination.offset,
    })
  );
}

export function setCachedUserList(
  tenantId: string,
  pagination: Pagination,
  users: Paginated<UserResponse>
): Promise<void> {
  return setCached(
    cacheKey(tenantId, USERS, {
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    users
  );
}

export function getCachedUser(
  tenantId: string,
  id: string
): Promise<UserResponse | null> {
  return getCached<UserResponse>(cacheKey(tenantId, USERS, { id }));
}

export function setCachedUser(
  tenantId: string,
  id: string,
  user: UserResponse
): Promise<void> {
  return setCached(cacheKey(tenantId, USERS, { id }), user);
}

export function invalidateTenantUsers(tenantId: string): Promise<void> {
  return invalidateResource(tenantId, USERS);
}
