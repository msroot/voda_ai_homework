import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import {
  buildTenantAssetSchema,
  createDefaultAssetSchema,
  normalizeAssetSchema,
  validateAssetSchemaBaseFields,
} from "../assets/mergeAssetSchema.js";
import { validateAssetSchema } from "../assets/validateAsset.js";
import {
  AppError,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createTenantWithAdmin,
  findLatestAssetSchema,
  findTenantById,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import type {
  CreateTenantInput,
  TenantWithSchema,
  UpdateTenantInput,
  User,
} from "../types.js";

// Authoritative (DB-backed) check that the caller is an admin of their own
// tenant. findUserById is RLS-scoped, so the user is only found when they belong
// to the caller's tenant; the role comes from the DB, not the (possibly stale)
// JWT claim.
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

// Returns the caller's own tenant (derived from the auth context), never an
// arbitrary one, together with its current (latest) asset schema and version.
export async function getCurrentTenant(): Promise<TenantWithSchema> {
  const tenant = await findTenantById(getTenantId());

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  const latest = await findLatestAssetSchema();

  if (!latest) {
    throw new AppError(500, "Tenant asset schema missing");
  }

  return { ...tenant, schema_version: latest.version, asset_schema: latest.schema };
}

// Onboarding: creates the tenant, version-1 asset schema, and first admin user
// atomically so the tenant can create assets immediately after login.
export async function createTenant(
  input: CreateTenantInput
): Promise<{ tenant: TenantWithSchema; user: User }> {
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
      tenant: {
        ...tenant,
        schema_version: 1,
        asset_schema: assetSchema,
      },
      user,
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

// Updates tenant metadata (name/slug). The asset schema is immutable after
// tenant creation — changing it would leave existing assets on an old version
// with a different shape than new ones.
export async function updateCurrentTenant(
  input: UpdateTenantInput
): Promise<TenantWithSchema> {
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

  return { ...tenant, schema_version: latest.version, asset_schema: latest.schema };
}
