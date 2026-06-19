import { randomUUID } from "crypto";
import { mergeAssetData, normalizeAssetData } from "../assetData.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import { AppError, isDuplicateKeyViolation } from "../errors/appError.js";
import {
  createAsset as createAssetRecord,
  deleteAsset as deleteAssetRecord,
  findAssetById,
  findAllAssets,
  updateAsset as updateAssetRecord,
} from "../repositories/assetRepository.js";
import { findTenantAssetSchema } from "../repositories/tenantRepository.js";
import { validateAssetData } from "../validateAsset.js";
import type { Asset, CreateAssetInput, UpdateAssetInput } from "../types.js";

export async function listAssets(): Promise<Asset[]> {
  return findAllAssets();
}

export async function getAsset(id: string): Promise<Asset> {
  const asset = await findAssetById(id);

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

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

  try {
    return await createAssetRecord(assetId, "pending", assetData, userId);
  } catch (err) {
    if (isDuplicateKeyViolation(err)) {
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

  const asset = await updateAssetRecord(
    id,
    data !== undefined ? JSON.stringify(nextData) : null,
    status ?? null
  );

  if (!asset) {
    throw new AppError(404, "Asset not found");
  }

  return asset;
}

export async function deleteAsset(id: string): Promise<void> {
  const deleted = await deleteAssetRecord(id);

  if (!deleted) {
    throw new AppError(404, "Asset not found");
  }
}
