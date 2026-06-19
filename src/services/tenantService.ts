import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import {
  createDefaultAssetSchema,
  extendAssetSchema,
} from "../mergeAssetSchema.js";
import {
  AppError,
  isUniqueViolation,
} from "../errors/appError.js";
import {
  createTenantWithAdmin,
  deleteTenant as deleteTenantRecord,
  findAllTenants,
  findTenantById,
  updateTenant as updateTenantRecord,
} from "../repositories/tenantRepository.js";
import type { CreateTenantInput, Tenant, UpdateTenantInput, User } from "../types.js";

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

export async function updateTenant(
  id: string,
  input: UpdateTenantInput
): Promise<Tenant> {
  const { name, slug, asset_schema } = input;

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
