import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { createApp } from "../src/app.js";
import { closeSeedConnections, runSeed } from "../seed/index.js";
import pool from "../src/clients/postgres.js";
import { closeMongo } from "../src/clients/mongo.js";
import { closeCache } from "../src/lib/cache.js";
import { closeRateLimiter } from "../src/middleware/rateLimit.js";

const app = createApp();

const PASSWORD = process.env.SEED_PASSWORD ?? "password123";
const ADMIN_KEY = process.env.PLATFORM_ADMIN_KEY;

// Seeded tenants (see seed/tenants.ts).
const TENANT_A = "11111111-1111-4111-8111-111111111111"; // Northwind
const TENANT_B = "22222222-2222-4222-8222-222222222222"; // Beacon

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: PASSWORD });
  expect(res.status, `login failed for ${email}: ${JSON.stringify(res.body)}`).toBe(200);
  return res.body.token as string;
}

async function firstAssetId(token: string): Promise<string> {
  const res = await request(app).get("/assets?limit=1").set(auth(token));
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThan(0);
  return res.body.data[0].id as string;
}

// Tokens for tenant A (admin/editor/viewer) and tenant B (admin).
let adminA: string;
let editorA: string;
let viewerA: string;
let adminB: string;

beforeAll(async () => {
  await runSeed();
  adminA = await login("amelia@northwind.test");
  editorA = await login("sam@northwind.test");
  viewerA = await login("declan@northwind.test");
  adminB = await login("cora@beacon.test");
});

afterAll(async () => {
  await Promise.allSettled([
    pool.end(),
    closeSeedConnections(),
    closeMongo(),
    closeCache(),
    closeRateLimiter(),
  ]);
});

describe("authentication", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get("/assets");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app).get("/assets").set(auth("not-a-real-token"));
    expect(res.status).toBe(401);
  });
});

describe("tenant isolation - assets (Mongo read model)", () => {
  it("only lists assets belonging to the caller's tenant", async () => {
    const res = await request(app).get("/assets?limit=100").set(auth(adminA));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const asset of res.body.data) {
      expect(asset.tenant_id).toBe(TENANT_A);
    }
  });

  it("cannot read another tenant's asset by id (404)", async () => {
    const bAssetId = await firstAssetId(adminB);
    const res = await request(app).get(`/assets/${bAssetId}`).set(auth(adminA));
    expect(res.status).toBe(404);
  });

  it("cannot update another tenant's asset (404)", async () => {
    const bAssetId = await firstAssetId(adminB);
    const res = await request(app)
      .put(`/assets/${bAssetId}`)
      .set(auth(adminA))
      .send({ status: "critical" });
    expect(res.status).toBe(404);
  });

  it("cannot delete another tenant's asset (404)", async () => {
    const bAssetId = await firstAssetId(adminB);
    const res = await request(app).delete(`/assets/${bAssetId}`).set(auth(adminA));
    expect(res.status).toBe(404);
  });
});

describe("tenant isolation - users", () => {
  it("only lists users belonging to the caller's tenant", async () => {
    const res = await request(app).get("/users?limit=100").set(auth(adminA));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const user of res.body.data) {
      expect(user.tenant_id).toBe(TENANT_A);
      expect(user.email).not.toContain("beacon.test");
    }
  });

  it("cannot read another tenant's user by id (404)", async () => {
    const listB = await request(app).get("/users?limit=1").set(auth(adminB));
    const userId = listB.body.data[0].id as string;
    const res = await request(app).get(`/users/${userId}`).set(auth(adminA));
    expect(res.status).toBe(404);
  });
});

describe("asset filtering", () => {
  it("filters assets by type and status", async () => {
    const byType = await request(app)
      .get("/assets?type=sensor&limit=100")
      .set(auth(adminA));
    expect(byType.status).toBe(200);
    expect(byType.body.data.length).toBeGreaterThan(0);
    for (const asset of byType.body.data) {
      expect(asset.type).toBe("sensor");
      expect(asset.tenant_id).toBe(TENANT_A);
    }

    const byStatus = await request(app)
      .get("/assets?status=ok&limit=100")
      .set(auth(adminA));
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.length).toBeGreaterThan(0);
    for (const asset of byStatus.body.data) {
      expect(asset.status).toBe("ok");
    }
  });
});

describe("tenant isolation - report", () => {
  it("reports tenant overview with users, schema, and asset aggregates", async () => {
    const res = await request(app).get("/reports/overview").set(auth(adminA));
    expect(res.status).toBe(200);
    expect(res.body.tenant.id).toBe(TENANT_A);
    expect(res.body.users.total).toBeGreaterThan(0);
    expect(typeof res.body.users.by_role).toBe("object");
    expect(res.body.asset_schema.versions_count).toBeGreaterThan(0);
    expect(res.body.asset_schema.current_version).toBe("v_1");
    expect(res.body.assets.total).toBeGreaterThan(0);
    expect(typeof res.body.assets.by_status).toBe("object");
    expect(typeof res.body.assets.by_schema_version).toBe("object");

    const statusSum = Object.values(
      res.body.assets.by_status as Record<string, number>
    ).reduce((a, b) => a + b, 0);
    expect(statusSum).toBe(res.body.assets.total);

    const versionSum = Object.values(
      res.body.assets.by_schema_version as Record<string, number>
    ).reduce((a, b) => a + b, 0);
    expect(versionSum).toBe(res.body.assets.total);
  });

  it("scopes report counts to each tenant separately", async () => {
    const resA = await request(app).get("/reports/overview").set(auth(adminA));
    const resB = await request(app).get("/reports/overview").set(auth(adminB));
    expect(resA.body.tenant.id).toBe(TENANT_A);
    expect(resB.body.tenant.id).toBe(TENANT_B);
    expect(resA.body.assets.total).toBeGreaterThan(0);
    expect(resB.body.assets.total).toBeGreaterThan(0);
    expect(resA.body.users.total).not.toBe(resB.body.users.total);
  });
});

describe("RBAC - asset writes", () => {
  it("forbids a viewer from creating assets (403)", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(viewerA))
      .send({});
    expect(res.status).toBe(403);
  });

  it("allows an editor to create a valid asset (201)", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(editorA))
      .set("Idempotency-Key", randomUUID())
      .send({
        name: `TEST-${Date.now()}`,
        type: "sensor",
        status: "ok",
        lat: 42.1,
        lng: -71.1,
        installed_at: "2020-01-01",
        material: "copper",
        diameter_mm: 100,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.tenant_id).toBe(TENANT_A);
    expect(res.body.extra_fields).toMatchObject({ material: "copper", diameter_mm: 100 });
    expect(res.body.updated_at).toBeNull();
    expect(res.body.synced_at).toBeNull();
    expect(res.body.synced_by).toBeNull();
  });

  it("GET /assets/:id matches POST /assets fields after Mongo sync", async () => {
    const assetName = `SYNC-TEST-${Date.now()}`;
    const createRes = await request(app)
      .post("/assets")
      .set(auth(editorA))
      .set("Idempotency-Key", randomUUID())
      .send({
        name: assetName,
        type: "sensor",
        status: "ok",
        lat: 42.1,
        lng: -71.1,
        installed_at: "2020-01-01",
        material: "copper",
        diameter_mm: 100,
      });
    expect(createRes.status).toBe(201);

    const { findAssetById } = await import("../src/repositories/assetRepository.js");
    const { upsertAssetDocument } = await import(
      "../src/repositories/assetMongoRepository.js"
    );
    const { runWithAuthContext } = await import("../src/lib/authContext.js");

    let asset: Awaited<ReturnType<typeof findAssetById>> = null;
    await runWithAuthContext(
      { userId: "23b8c1e9-3924-46de-beb1-3b9046685257", tenantId: TENANT_A, role: "admin" },
      async () => {
        asset = await findAssetById(createRes.body.id as string);
        if (asset) {
          await upsertAssetDocument(asset, asset.modified_by);
        }
      }
    );
    expect(asset).not.toBeNull();

    const getRes = await request(app)
      .get(`/assets/${createRes.body.id}`)
      .set(auth(viewerA));
    expect(getRes.status).toBe(200);

    expect(getRes.body).toMatchObject({
      id: createRes.body.id,
      tenant_id: createRes.body.tenant_id,
      schema_version: createRes.body.schema_version,
      name: createRes.body.name,
      type: createRes.body.type,
      status: createRes.body.status,
      lat: createRes.body.lat,
      lng: createRes.body.lng,
      installed_at: createRes.body.installed_at,
      extra_fields: createRes.body.extra_fields,
    });
    expect(getRes.body.synced_at).not.toBeNull();
    expect(getRes.body.synced_by).toBe(asset!.modified_by);
    expect(getRes.body.updated_at).not.toBeNull();
  });

  it("allows a viewer to read assets (200)", async () => {
    const res = await request(app).get("/assets").set(auth(viewerA));
    expect(res.status).toBe(200);
  });
});

describe("RBAC - user management (admin only)", () => {
  it("forbids an editor from creating users (403)", async () => {
    const res = await request(app)
      .post("/users")
      .set(auth(editorA))
      .send({ name: "x", email: "x@x.test", password: "pw", role: "viewer" });
    expect(res.status).toBe(403);
  });

  it("allows an admin to create a user (201)", async () => {
    const res = await request(app)
      .post("/users")
      .set(auth(adminA))
      .send({
        name: "New User",
        email: `newuser-${Date.now()}@northwind.test`,
        password: "password123",
        role: "viewer",
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.tenant_id).toBe(TENANT_A);

    const getRes = await request(app).get(`/users/${res.body.id}`).set(auth(adminA));
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(res.body);
  });
});

describe("tenant self-management", () => {
  it("returns the caller's own tenant", async () => {
    const res = await request(app).get("/tenants/current").set(auth(adminA));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TENANT_A);
  });

  it("forbids a viewer from updating the tenant (403)", async () => {
    const res = await request(app)
      .put("/tenants/current")
      .set(auth(viewerA))
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("lets an admin update their own tenant (200)", async () => {
    const res = await request(app)
      .put("/tenants/current")
      .set(auth(adminA))
      .send({ name: "Northwind Utilities (updated)" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TENANT_A);
    expect(res.body.name).toBe("Northwind Utilities (updated)");
  });
});

describe("platform provisioning (x-admin-key)", () => {
  it("rejects tenant creation without the platform admin key (401)", async () => {
    const res = await request(app)
      .post("/tenants")
      .send({
        name: "No Key Co",
        slug: `no-key-${Date.now()}`,
        admin: { name: "Root", email: `root-${Date.now()}@nokey.test`, password: "pw" },
      });
    expect(res.status).toBe(401);
  });

  it.runIf(ADMIN_KEY)(
    "creates a tenant with default schema version 1 and can create assets (201)",
    async () => {
      const slug = `keyed-${Date.now()}`;
      const email = `root-${Date.now()}@keyed.test`;
      const res = await request(app)
        .post("/tenants")
        .set("x-admin-key", ADMIN_KEY as string)
        .send({
          name: "Keyed Co",
          slug,
          admin: {
            name: "Root",
            email,
            password: "password123",
          },
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.tenant).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.tenant.schema_version).toBe("v_1");
      expect(res.body.tenant.asset_schema).toBeDefined();
      expect(res.body.tenant.asset_schema.required).toContain("tenant_id");
      expect(res.body.tenant.asset_schema.required).toContain("status");
      expect(res.body.tenant.asset_schema.required).toContain("name");

      const token = await login(email);
      const assetRes = await request(app)
        .post("/assets")
        .set(auth(token))
        .set("Idempotency-Key", randomUUID())
        .send({
          name: `TEST-${Date.now()}`,
          type: "sensor",
          status: "ok",
          lat: 42.1,
          lng: -71.1,
          installed_at: "2020-01-01",
        });
      expect(assetRes.status, JSON.stringify(assetRes.body)).toBe(201);
      expect(assetRes.body.id).toBeDefined();
      expect(assetRes.body.tenant_id).toBe(res.body.tenant.id);
    }
  );
});
