import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";
import { hashPassword } from "../src/auth.js";
import { normalizeAssetData } from "../src/assetSchema.js";
import { closeMongo } from "../src/clients/mongo.js";
import {
  ensureAssetIndexes,
  replaceAssetDocuments,
} from "../src/repositories/assetMongoRepository.js";
import type { Asset } from "../src/types.js";
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
      `INSERT INTO tenants (id, name, slug, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         created_at = EXCLUDED.created_at`,
      [tenant.id, tenant.name, tenant.slug, tenant.created_at]
    );

    // Immutable: insert version 1 only; PG blocks updates/deletes.
    await adminPool.query(
      `INSERT INTO asset_schemas (tenant_id, version, schema)
       VALUES ($1, 1, $2)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenant.id, JSON.stringify(tenant.asset_schema)]
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

  const assetDocs: Asset[] = [];

  for (const asset of assets) {
    const createdBy = defaultUserByTenant.get(asset.tenant_id);
    if (!createdBy) {
      throw new Error(`No seed user found for tenant ${asset.tenant_id}`);
    }

    const normalizedAsset = normalizeAssetData(asset, asset.tenant_id, asset.id);

    // Seeded rows are written directly to Mongo below, so they start as
    // 'synced' and are not re-processed by the outbox/worker.
    await adminPool.query(
      `INSERT INTO assets (id, tenant_id, status, schema_version, data, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         status = EXCLUDED.status,
         schema_version = EXCLUDED.schema_version,
         data = EXCLUDED.data,
         created_by = EXCLUDED.created_by`,
      [
        asset.id,
        asset.tenant_id,
        "synced",
        1,
        JSON.stringify(normalizedAsset),
        createdBy,
      ]
    );

    assetDocs.push({
      id: asset.id,
      tenant_id: asset.tenant_id,
      status: "synced",
      action: "upsert",
      schema_version: 1,
      data: normalizedAsset,
      created_by: createdBy,
      created_at: new Date(),
    });
  }

  // Apply collection validator/indexes before inserting the read-model mirror.
  await ensureAssetIndexes();
  await replaceAssetDocuments(assetDocs);

  return assets.length;
}

// Closes the privileged seed connection. Used by tests after seeding so the
// process can exit cleanly (the shared Mongo client is closed via closeMongo).
export async function closeSeedConnections() {
  await adminPool.end();
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
      .finally(() => Promise.all([adminPool.end(), closeMongo()]));
  });
}
