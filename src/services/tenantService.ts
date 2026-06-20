import { randomUUID } from "crypto";
import { hashPassword, getTenantId, getUserId } from "../auth.js";
import {
  tenantToResponse,
  userToResponse,
  type TenantResponse,
  type UserResponse,
} from "../responses.js";
import {
  buildTenantAssetSchema,
  createDefaultAssetSchema,
  normalizeAssetSchema,
  validateAssetSchema,
  validateAssetSchemaBaseFields,
} from "../assetSchema.js";
import { AppError, isUniqueViolation } from "../appError.js";
import type { CreateTenantInput, UpdateTenantInput } from "../schemas.js";
import {
  createTenantWithAdmin,
  findLatestAssetSchema,
  findTenantById,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import { findUserById } from "../repositories/userRepository.js";

function finalizeAssetSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeAssetSchema(schema);

  const baseFields = validateAssetSchemaBaseFields(normalized);
  if (!baseFields.valid) {
    throw new AppError(500, "Asset schema is missing required base fields", baseFields.errors);
  }

  const ajvCheck = validateAssetSchema(normalized);
  if (!ajvCheck.valid) {
    throw new AppError(400, "Invalid asset JSON Schema", ajvCheck.errors);
  }

  return normalized;
}

async function assertCurrentUserIsTenantAdmin(): Promise<void> {
  const user = await findUserById(getUserId());

  if (!user || user.role !== "admin") {
    throw new AppError(403, "Only an admin of this tenant can perform this action");
  }
}

export async function getCurrentTenant(): Promise<TenantResponse> {
  const tenant = await findTenantById(getTenantId());

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  const latest = await findLatestAssetSchema();

  if (!latest) {
    throw new AppError(500, "Tenant asset schema missing");
  }

  return tenantToResponse(tenant, latest.version, latest.schema);
}

export async function createTenant(
  input: CreateTenantInput
): Promise<{ tenant: TenantResponse; user: UserResponse }> {
  const { name, slug, admin, asset_schema } = input;
  const passwordHash = await hashPassword(admin.password);

  const assetSchema = finalizeAssetSchema(
    asset_schema !== undefined
      ? buildTenantAssetSchema(asset_schema)
      : createDefaultAssetSchema()
  );

  try {
    const { tenant, user } = await createTenantWithAdmin({
      tenantId: randomUUID(),
      name,
      slug,
      assetSchema,
      userId: randomUUID(),
      userName: admin.name,
      userEmail: admin.email,
      passwordHash,
      role: "admin",
    });

    return {
      tenant: tenantToResponse(tenant, 1, assetSchema),
      user: userToResponse(user),
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const constraint = (err as { constraint?: string }).constraint ?? "";
      throw new AppError(
        409,
        constraint.includes("email")
          ? "admin email already exists"
          : "slug already exists"
      );
    }
    throw err;
  }
}

export async function updateCurrentTenant(
  input: UpdateTenantInput
): Promise<TenantResponse> {
  await assertCurrentUserIsTenantAdmin();

  const tenantId = getTenantId();
  const { name, slug } = input;

  let tenant;
  try {
    tenant = await updateTenantRecord(tenantId, name ?? null, slug ?? null);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "slug already exists");
    }
    throw err;
  }

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  const latest = await findLatestAssetSchema();
  if (!latest) {
    throw new AppError(500, "Tenant asset schema missing");
  }

  return tenantToResponse(tenant, latest.version, latest.schema);
}
