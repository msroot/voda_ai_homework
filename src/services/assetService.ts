import { randomUUID } from "crypto";
import {
  assetRecordToResponse,
  postgresAssetToResponse,
  type AssetResponse,
} from "../responses.js";
import { mergeAssetData, normalizeAssetData, validateAssetData } from "../assetSchema.js";
import { getTenantId, getUserId } from "../auth.js";
import { AppError, isUniqueViolation } from "../appError.js";
import {
  createAsset as createAssetRecord,
  markAssetForDeletion,
  findAssetById,
  updateAsset as updateAssetRecord,
} from "../repositories/assetRepository.js";
import {
  findAssetDocumentById,
  findAssetDocuments,
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
} from "../cache.js";
import type { AssetFilter, AssetWriteInput } from "../schemas.js";
import type { Paginated } from "../types.js";

export async function listAssets(
  filter: AssetFilter
): Promise<Paginated<AssetResponse>> {
  const tenantId = getTenantId();

  const cached = await getCachedAssetList(tenantId, filter);
  if (cached) {
    return cached;
  }

  const { rows, total } = await findAssetDocuments(filter);
  const result: Paginated<AssetResponse> = {
    data: rows.map(({ id, record }) => assetRecordToResponse(id, record)),
    pagination: { limit: filter.limit, offset: filter.offset, total },
  };

  await setCachedAssetList(tenantId, filter, result);
  return result;
}

export async function getAsset(id: string): Promise<AssetResponse> {
  const tenantId = getTenantId();

  const cached = await getCachedAsset(tenantId, id);
  if (cached) {
    return cached;
  }

  const asset = await findAssetDocumentById(id);

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

  const response = assetRecordToResponse(asset.id, asset.record);
  await setCachedAsset(tenantId, id, response);
  return response;
}

export async function createAsset(input: AssetWriteInput): Promise<AssetResponse> {
  const { data } = input;
  const userId = getUserId();
  const tenantId = getTenantId();

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

  try {
    const created = await createAssetRecord(
      assetId,
      "pending",
      latest.version,
      assetData,
      userId
    );
    await invalidateTenantAssets(tenantId);
    return postgresAssetToResponse(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "Asset id already exists");
    }
    throw err;
  }
}

export async function updateAsset(
  id: string,
  input: AssetWriteInput
): Promise<AssetResponse> {
  const { data } = input;

  const existing = await findAssetById(id);

  if (!existing) {
    throw new AppError(404, "Asset not found");
  }

  const schema = await findAssetSchemaByVersion(existing.schema_version);
  if (!schema) {
    throw new AppError(404, "Asset schema version not found");
  }

  const nextData = mergeAssetData(existing.data, data);

  const validation = validateAssetData(schema, nextData);
  if (!validation.valid) {
    throw new AppError(400, "Asset validation failed", validation.errors);
  }

  const asset = await updateAssetRecord(id, JSON.stringify(nextData));

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

  await invalidateTenantAssets(getTenantId());
  return postgresAssetToResponse(asset);
}

export async function deleteAsset(id: string): Promise<void> {
  const marked = await markAssetForDeletion(id);

  if (!marked) {
    throw new AppError(404, "Asset not found");
  }

  await invalidateTenantAssets(getTenantId());
}
