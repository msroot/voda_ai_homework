import { randomUUID } from "crypto";
import { mergeAssetData, normalizeAssetData } from "../assets/assetData.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import { AppError, isUniqueViolation } from "../errors/appError.js";
import {
  createAsset as createAssetRecord,
  markAssetForDeletion,
  findAssetById,
  updateAsset as updateAssetRecord,
} from "../repositories/assetRepository.js";
import {
  findAssetDocumentById,
  findAssetDocuments,
  type AssetView,
} from "../repositories/assetMongoRepository.js";
import {
  findAssetSchemaByVersion,
  findLatestAssetSchema,
} from "../repositories/tenantRepository.js";
import {
  getCachedAsset,
  getCachedAssetList,
  invalidateTenantAssets,
  setCachedAsset,
  setCachedAssetList,
} from "../cache/assetCache.js";
import { validateAssetData } from "../assets/validateAsset.js";
import type { AssetFilter } from "../schemas.js";
import type {
  Asset,
  CreateAssetInput,
  Paginated,
  UpdateAssetInput,
} from "../types.js";

// Reads are served from MongoDB in the structured read model and cached in
// Redis. An asset only appears here once the outbox worker has synced it from
// Postgres, so freshly created assets become readable after the sync completes
// (eventual consistency). The cache is invalidated on every write and sync.
export async function listAssets(
  filter: AssetFilter
): Promise<Paginated<AssetView>> {
  const tenantId = getTenantId();

  const cached = await getCachedAssetList(tenantId, filter);
  if (cached) {
    return cached;
  }

  const { rows, total } = await findAssetDocuments(filter);
  const result: Paginated<AssetView> = {
    data: rows,
    pagination: { limit: filter.limit, offset: filter.offset, total },
  };

  await setCachedAssetList(tenantId, filter, result);
  return result;
}

export async function getAsset(id: string): Promise<AssetView> {
  const tenantId = getTenantId();

  const cached = await getCachedAsset(tenantId, id);
  if (cached) {
    return cached;
  }

  const asset = await findAssetDocumentById(id);

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

  await setCachedAsset(tenantId, id, asset);
  return asset;
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  const { data } = input;
  const userId = getUserId();
  const tenantId = getTenantId();

  // New assets validate against, and are pinned to, the tenant's latest schema
  // version.
  const latest = await findLatestAssetSchema();
  if (!latest) {
    throw new AppError(404, "Tenant not found");
  }

  const assetId = typeof data.id === "string" ? data.id : randomUUID();
  const assetData = normalizeAssetData(data, tenantId, assetId);

  const validation = validateAssetData(latest.schema, assetData);
  if (!validation.valid) {
    throw new AppError(400, "Asset validation failed", validation.errors);
  }

  // The row itself is the outbox entry: status "pending" is picked up by the
  // listener (polling) and synced to MongoDB by the worker, which flips it to
  // "synced". No separate event publish is needed.
  try {
    const created = await createAssetRecord(
      assetId,
      "pending",
      latest.version,
      assetData,
      userId
    );
    await invalidateTenantAssets(tenantId);
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "Asset id already exists");
    }
    throw err;
  }
}

export async function updateAsset(
  id: string,
  input: UpdateAssetInput
): Promise<Asset> {
  const { data, status } = input;

  const existing = await findAssetById(id);

  if (!existing) {
    throw new AppError(404, "Asset not found");
  }

  let nextData = existing.data;

  if (data !== undefined) {
    // Re-validate against the schema version this asset was created with, so a
    // later tenant schema change can't break edits to an older asset.
    const schema = await findAssetSchemaByVersion(existing.schema_version);
    if (!schema) {
      throw new AppError(404, "Asset schema version not found");
    }

    nextData = mergeAssetData(existing.data, data);

    const validation = validateAssetData(schema, nextData);
    if (!validation.valid) {
      throw new AppError(400, "Asset validation failed", validation.errors);
    }
  }

  // A data change must re-enter the outbox (status -> "pending") so the worker
  // re-syncs it to MongoDB; otherwise the Mongo-backed reads would stay stale.
  const asset = await updateAssetRecord(
    id,
    data !== undefined ? JSON.stringify(nextData) : null,
    data !== undefined ? "pending" : status ?? null
  );

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

  await invalidateTenantAssets(getTenantId());
  return asset;
}

export async function deleteAsset(id: string): Promise<void> {
  // Same outbox path as create/update: mark the row as a delete tombstone in
  // Postgres and let the worker remove it from MongoDB, then hard-delete the
  // row. The cache is expired now so reads don't serve the soon-to-be-gone asset
  // from Redis.
  const marked = await markAssetForDeletion(id);

  if (!marked) {
    throw new AppError(404, "Asset not found");
  }

  await invalidateTenantAssets(getTenantId());
}
