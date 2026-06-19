import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import { hashPassword } from "../src/auth/password.js";
import { normalizeAssetData } from "../src/assetData.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

const SEED_DIR = join(process.cwd(), "seed");
const DEFAULT_SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123";

// Seeding runs migrations and creates the app role, so it uses the privileged
// DATABASE_URL connection rather than the restricted app pool.
const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface AssetSeed {
  id: string;
  tenant_id: string;
  [key: string]: unknown;
}

async function resetDatabase() {
  const sql = readFileSync(join(SEED_DIR, "reset.sql"), "utf-8");
  await adminPool.query(sql);
}

async function createSchema() {
  const sql = readFileSync(join(SEED_DIR, "schema.sql"), "utf-8");
  await adminPool.query(sql);
}

async function seedTenants() {
  for (const tenant of tenants) {
    await adminPool.query(
      `INSERT INTO tenants (id, name, slug, asset_schema, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         asset_schema = EXCLUDED.asset_schema,
         created_at = EXCLUDED.created_at`,
      [
        tenant.id,
        tenant.name,
        tenant.slug,
        JSON.stringify(tenant.asset_schema),
        tenant.created_at,
      ]
    );
  }
}

async function seedUsers() {
  const passwordHash = await hashPassword(DEFAULT_SEED_PASSWORD);

  for (const user of users) {
    await adminPool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         created_at = EXCLUDED.created_at`,
      [
        user.id,
        user.tenant_id,
        user.name,
        user.email,
        passwordHash,
        user.role,
        user.created_at,
      ]
    );
  }
}

async function seedAssets() {
  const assets: AssetSeed[] = JSON.parse(
    readFileSync(join(SEED_DIR, "assets.seed.json"), "utf-8")
  );

  const defaultUserByTenant = new Map<string, string>();
  for (const user of users) {
    if (!defaultUserByTenant.has(user.tenant_id)) {
      defaultUserByTenant.set(user.tenant_id, user.id);
    }
  }

  for (const asset of assets) {
    const createdBy = defaultUserByTenant.get(asset.tenant_id);
    if (!createdBy) {
      throw new Error(`No seed user found for tenant ${asset.tenant_id}`);
    }

    const normalizedAsset = normalizeAssetData(asset, asset.tenant_id, asset.id);

    await adminPool.query(
      `INSERT INTO assets (id, tenant_id, status, data, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         status = EXCLUDED.status,
         data = EXCLUDED.data,
         created_by = EXCLUDED.created_by`,
      [
        asset.id,
        asset.tenant_id,
        "active",
        JSON.stringify(normalizedAsset),
        createdBy,
      ]
    );
  }

  return assets.length;
}

export async function runSeed() {
  await resetDatabase();
  await createSchema();
  await seedTenants();
  await seedUsers();
  const assetCount = await seedAssets();
  console.log(
    `Seeded ${tenants.length} tenants, ${users.length} users, ${assetCount} assets`
  );
}

const isDirectRun = /seed\/index\.(t|j)sx?$/.test(process.argv[1] ?? "");

if (isDirectRun) {
  import("dotenv/config").then(() => {
    runSeed()
      .catch((err) => {
        console.error(err);
        process.exit(1);
      })
      .finally(() => adminPool.end());
  });
}
