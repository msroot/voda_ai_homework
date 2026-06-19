import { readFileSync } from "fs";
import { join } from "path";
import pool from "../src/db.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

const SEED_DIR = join(process.cwd(), "seed");

const COMMON_ASSET_FIELDS = [
  "id",
  "tenant_id",
  "name",
  "type",
  "status",
  "lat",
  "lng",
  "installed_at",
] as const;

interface AssetSeed {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  installed_at: string;
  [key: string]: unknown;
}

async function resetDatabase() {
  const sql = readFileSync(join(SEED_DIR, "reset.sql"), "utf-8");
  await pool.query(sql);
}

async function createSchema() {
  const sql = readFileSync(join(SEED_DIR, "schema.sql"), "utf-8");
  await pool.query(sql);
}

async function seedTenants() {
  for (const tenant of tenants) {
    await pool.query(
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
  for (const user of users) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         created_at = EXCLUDED.created_at`,
      [user.id, user.tenant_id, user.name, user.email, user.role, user.created_at]
    );
  }
}

function tenantSpecificData(asset: AssetSeed): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(asset)) {
    if (!COMMON_ASSET_FIELDS.includes(key as (typeof COMMON_ASSET_FIELDS)[number])) {
      data[key] = value;
    }
  }
  return data;
}

async function seedAssets() {
  const assets: AssetSeed[] = JSON.parse(
    readFileSync(join(SEED_DIR, "assets.seed.json"), "utf-8")
  );

  for (const asset of assets) {
    await pool.query(
      `INSERT INTO assets (id, tenant_id, name, type, status, lat, lng, installed_at, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         status = EXCLUDED.status,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         installed_at = EXCLUDED.installed_at,
         data = EXCLUDED.data`,
      [
        asset.id,
        asset.tenant_id,
        asset.name,
        asset.type,
        asset.status,
        asset.lat,
        asset.lng,
        asset.installed_at,
        JSON.stringify(tenantSpecificData(asset)),
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
