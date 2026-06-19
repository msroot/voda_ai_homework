import { cacheKey, getCached, invalidateResource, setCached } from "./cache.js";
import type { AssetView } from "../repositories/assetMongoRepository.js";
import type { AssetFilter } from "../schemas.js";
import type { Paginated } from "../types.js";

const RESOURCE = "assets";

function listParams(filter: AssetFilter): Record<string, unknown> {
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
): Promise<Paginated<AssetView> | null> {
  return getCached<Paginated<AssetView>>(
    cacheKey(tenantId, RESOURCE, listParams(filter))
  );
}

export function setCachedAssetList(
  tenantId: string,
  filter: AssetFilter,
  assets: Paginated<AssetView>
): Promise<void> {
  return setCached(cacheKey(tenantId, RESOURCE, listParams(filter)), assets);
}

export function getCachedAsset(
  tenantId: string,
  id: string
): Promise<AssetView | null> {
  return getCached<AssetView>(cacheKey(tenantId, RESOURCE, { id }));
}

export function setCachedAsset(
  tenantId: string,
  id: string,
  asset: AssetView
): Promise<void> {
  return setCached(cacheKey(tenantId, RESOURCE, { id }), asset);
}

export function invalidateTenantAssets(tenantId: string): Promise<void> {
  return invalidateResource(tenantId, RESOURCE);
}
