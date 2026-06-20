import { formatSchemaVersion } from "../api/schemaVersion.js";
import { getTenantId } from "../context/authContext.js";
import { AppError } from "../errors/appError.js";
import {
  aggregateAssetSchemaVersionCounts,
  aggregateAssetStatusCounts,
  countTenantAssets,
} from "../repositories/assetMongoRepository.js";
import {
  findTenantAssetSchemaSummary,
  findTenantById,
} from "../repositories/tenantRepository.js";
import { countUsersByRole } from "../repositories/userRepository.js";

export interface TenantOverviewReport {
  tenant: { id: string; name: string; slug: string };
  users: {
    total: number;
    by_role: Record<string, number>;
  };
  asset_schema: {
    versions_count: number;
    versions: string[];
    current_version: string;
  };
  assets: {
    total: number;
    by_status: Record<string, number>;
    by_schema_version: Record<string, number>;
  };
  generated_at: string;
}

function statusCountMap(
  rows: Array<{ status: string | null; count: number }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.status ?? "unknown"] = row.count;
  }
  return map;
}

function schemaVersionCountMap(
  rows: Array<{ schema_version: number; count: number }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[formatSchemaVersion(row.schema_version)] = row.count;
  }
  return map;
}

// Cross-store overview: tenant + users + schema metadata from Postgres,
// asset aggregates from MongoDB, scoped to the caller's tenant.
export async function getTenantOverviewReport(): Promise<TenantOverviewReport> {
  const tenantId = getTenantId();

  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    throw new AppError(404, "Tenant not found");
  }

  const [users, schemaSummary, statusCounts, schemaVersionCounts, assetTotal] =
    await Promise.all([
      countUsersByRole(),
      findTenantAssetSchemaSummary(),
      aggregateAssetStatusCounts(tenantId),
      aggregateAssetSchemaVersionCounts(tenantId),
      countTenantAssets(tenantId),
    ]);

  if (!schemaSummary) {
    throw new AppError(500, "Tenant asset schema missing");
  }

  const versions = schemaSummary.versions.map((row) => formatSchemaVersion(row.version));

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    users,
    asset_schema: {
      versions_count: versions.length,
      versions,
      current_version: formatSchemaVersion(
        Math.max(...schemaSummary.versions.map((row) => row.version))
      ),
    },
    assets: {
      total: assetTotal,
      by_status: statusCountMap(statusCounts),
      by_schema_version: schemaVersionCountMap(schemaVersionCounts),
    },
    generated_at: new Date().toISOString(),
  };
}
