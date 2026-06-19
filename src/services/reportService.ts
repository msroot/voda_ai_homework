import { getTenantId } from "../context/authContext.js";
import { AppError } from "../errors/appError.js";
import { aggregateAssetStatusCounts } from "../repositories/assetMongoRepository.js";
import { findTenantById } from "../repositories/tenantRepository.js";

export interface AssetStatusReport {
  tenant: { id: string; name: string; slug: string };
  total: number;
  by_status: Record<string, number>;
  generated_at: string;
}

// Cross-store report: tenant metadata from Postgres joined with asset status
// counts from MongoDB, scoped to the caller's tenant.
export async function getAssetStatusReport(): Promise<AssetStatusReport> {
  const tenantId = getTenantId();

  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  const counts = await aggregateAssetStatusCounts(tenantId);

  const by_status: Record<string, number> = {};
  let total = 0;
  for (const { status, count } of counts) {
    by_status[status ?? "unknown"] = count;
    total += count;
  }

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    total,
    by_status,
    generated_at: new Date().toISOString(),
  };
}
