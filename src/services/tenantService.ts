import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import {
  createDefaultAssetSchema,
  extendAssetSchema,
} from "../assets/mergeAssetSchema.js";
import {
  AppError,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createTenantWithAdmin,
  findLatestAssetSchema,
  findTenantById,
  insertNextAssetSchema,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import type {
  CreateTenantInput,
  Tenant,
  TenantWithSchema,
  UpdateTenantInput,
  User,
} from "../types.js";

// Authoritative (DB-backed) check that the caller is an admin of their own
// tenant. findUserById is RLS-scoped, so the user is only found when they belong
// to the caller's tenant; the role comes from the DB, not the (possibly stale)
// JWT claim.
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

// Onboarding: creates the tenant and its first admin user atomically (one
// transaction) so the new tenant can immediately authenticate and manage
// itself, with no risk of an orphaned tenant if the user insert fails.
export async function createTenant(
  input: CreateTenantInput
): Promise<{ tenant: Tenant; user: User }> {
  const { name, slug, admin } = input;
  const passwordHash = await hashPassword(admin.password);

  try {
    return await createTenantWithAdmin({
      tenantId: randomUUID(),
      name,
      slug,
      assetSchema: createDefaultAssetSchema(),
      userId: randomUUID(),
      userName: admin.name,
      userEmail: admin.email,
      passwordHash,
      role: "admin",
    });
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

// Updates the caller's own tenant. A provided asset_schema is merged into (not
// replaced) the current schema and stored as a NEW version; older assets keep
// validating against the version they were created with.
export async function updateCurrentTenant(
  input: UpdateTenantInput
): Promise<TenantWithSchema> {
  await assertCurrentUserIsTenantAdmin();

  const tenantId = getTenantId();
  const { name, slug, asset_schema } = input;

  let tenant: Tenant | null;
  try {
    tenant =
      name !== undefined || slug !== undefined
        ? await updateTenantRecord(tenantId, name ?? null, slug ?? null)
        : await findTenantById(tenantId);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "slug already exists");
    }
    throw err;
  }

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  let latest = await findLatestAssetSchema();
  if (!latest) {
    throw new AppError(500, "Tenant asset schema missing");
  }

  // A schema extension creates a new version that becomes the current one.
  if (asset_schema !== undefined) {
    const merged = extendAssetSchema(latest.schema, asset_schema);
    latest = await insertNextAssetSchema(JSON.stringify(merged));
  }

  return { ...tenant, schema_version: latest.version, asset_schema: latest.schema };
}
