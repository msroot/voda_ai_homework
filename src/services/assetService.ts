import { randomUUID } from "crypto";
import { mergeAssetData, normalizeAssetData } from "../assetData.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import { AppError, isUniqueViolation } from "../errors/appError.js";
import {
  createAsset as createAssetRecord,
  deleteAsset as deleteAssetRecord,
  findAssetById,
  updateAsset as updateAssetRecord,
} from "../repositories/assetRepository.js";
import {
  deleteAssetDocument,
  findAssetDocumentById,
  findAssetDocuments,
  type AssetView,
} from "../repositories/assetMongoRepository.js";
import { findTenantAssetSchema } from "../repositories/tenantRepository.js";
import {
  getCachedAsset,
  getCachedAssetList,
  invalidateTenantAssets,
  setCachedAsset,
  setCachedAssetList,
} from "../cache/assetCache.js";
import { validateAssetData } from "../validateAsset.js";
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

  const schema = await findTenantAssetSchema();
  if (!schema) {
    throw new AppError(404, "Tenant not found");
  }

  const assetId = typeof data.id === "string" ? data.id : randomUUID();
  const assetData = normalizeAssetData(data, tenantId, assetId);

  const validation = validateAssetData(schema, assetData);
  if (!validation.valid) {
    throw new AppError(400, "Asset validation failed", validation.errors);
  }

  // The row itself is the outbox entry: status "pending" is picked up by the
  // listener (polling) and synced to MongoDB by the worker, which flips it to
  // "synced". No separate event publish is needed.
  try {
    const created = await createAssetRecord(assetId, "pending", assetData, userId);
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
    const schema = await findTenantAssetSchema();
    if (!schema) {
      throw new AppError(404, "Tenant not found");
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
  const deleted = await deleteAssetRecord(id);

  if (!deleted) {
    throw new AppError(404, "Asset not found");
  }

  // Keep the Mongo read model in sync with the Postgres source of truth.
  await deleteAssetDocument(id);
  await invalidateTenantAssets(getTenantId());
}
