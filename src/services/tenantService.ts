import { randomUUID } from "crypto";
import {
  createDefaultAssetSchema,
  extendAssetSchema,
} from "../mergeAssetSchema.js";
import {
  AppError,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createTenant as createTenantRecord,
  deleteTenant as deleteTenantRecord,
  findAllTenants,
  findTenantById,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import type { CreateTenantInput, Tenant, UpdateTenantInput } from "../types.js";

export async function listTenants(): Promise<Tenant[]> {
  return findAllTenants();
}

export async function getTenant(id: string): Promise<Tenant> {
  const tenant = await findTenantById(id);

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  return tenant;
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const { name, slug } = input;

  if (!name || !slug) {
    throw new AppError(400, "name and slug are required");
  }

  try {
    return await createTenantRecord(
      randomUUID(),
      name,
      slug,
      createDefaultAssetSchema()
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "slug already exists");
    }
    throw err;
  }
}

export async function updateTenant(
  id: string,
  input: UpdateTenantInput
): Promise<Tenant> {
  const { name, slug, asset_schema } = input;

  if (name === undefined && slug === undefined && asset_schema === undefined) {
    throw new AppError(400, "at least one of name, slug, or asset_schema is required");
  }

  if (
    asset_schema !== undefined &&
    (typeof asset_schema !== "object" || asset_schema === null || Array.isArray(asset_schema))
  ) {
    throw new AppError(400, "asset_schema must be a JSON object");
  }

  let mergedAssetSchema: string | null = null;

  if (asset_schema !== undefined) {
    const existing = await findTenantById(id);

    if (!existing) {
      throw new AppError(404, "Tenant not found");
    }

    mergedAssetSchema = JSON.stringify(
      extendAssetSchema(existing.asset_schema, asset_schema)
    );
  }

  try {
    const tenant = await updateTenantRecord(
      id,
      name ?? null,
      slug ?? null,
      mergedAssetSchema
    );

    if (!tenant) {
      throw new AppError(404, "Tenant not found");
    }

    return tenant;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    if (isUniqueViolation(err)) {
      throw new AppError(409, "slug already exists");
    }
    throw err;
  }
}

export async function deleteTenant(id: string): Promise<void> {
  const deleted = await deleteTenantRecord(id);

  if (!deleted) {
    throw new AppError(404, "Tenant not found");
  }
}
