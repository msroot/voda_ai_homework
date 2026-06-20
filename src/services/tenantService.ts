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
  findTenantById,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import type { CreateTenantInput, Tenant, UpdateTenantInput, User } from "../types.js";

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
// arbitrary one.
export async function getCurrentTenant(): Promise<Tenant> {
  const tenant = await findTenantById(getTenantId());

  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  return tenant;
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

// Updates the caller's own tenant. asset_schema is merged into (not replaced)
// the existing schema.
export async function updateCurrentTenant(
  input: UpdateTenantInput
): Promise<Tenant> {
  await assertCurrentUserIsTenantAdmin();

  const tenantId = getTenantId();
  const { name, slug, asset_schema } = input;

  let mergedAssetSchema: string | null = null;

  if (asset_schema !== undefined) {
    const existing = await findTenantById(tenantId);

    if (!existing) {
      throw new AppError(404, "Tenant not found");
    }

    mergedAssetSchema = JSON.stringify(
      extendAssetSchema(existing.asset_schema, asset_schema)
    );
  }

  try {
    const tenant = await updateTenantRecord(
      tenantId,
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
