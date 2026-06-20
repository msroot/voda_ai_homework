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
import { closeIdempotency } from "../src/middleware/idempotency.js";

const app = createApp();
const PASSWORD = process.env.SEED_PASSWORD ?? "password123";

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function login(email: string): Promise<string> {
  const res = await request(app)
    .post("/auth/login")
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

let editorToken: string;

beforeAll(async () => {
  await runSeed();
  editorToken = await login("sam@northwind.test");
});

afterAll(async () => {
  await Promise.allSettled([
    pool.end(),
    closeSeedConnections(),
    closeMongo(),
    closeCache(),
    closeRateLimiter(),
    closeIdempotency(),
  ]);
});

describe("Idempotency-Key", () => {
  it("replays the same successful response for duplicate POST /assets", async () => {
    const key = randomUUID();
    const body = {
      name: `idem-${key.slice(0, 8)}`,
      type: "sensor",
      status: "ok",
      lat: 42.1,
      lng: -71.1,
      installed_at: "2020-01-01",
      material: "copper",
      diameter_mm: 100,
    };

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);

    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  it("rejects the same key with a different body", async () => {
    const key = randomUUID();
    const base = {
      type: "sensor",
      status: "ok",
      lat: 42.1,
      lng: -71.1,
      installed_at: "2020-01-01",
      material: "copper",
      diameter_mm: 100,
    };

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send({ ...base, name: `idem-a-${key.slice(0, 8)}` });

    expect(first.status).toBe(201);

    const conflict = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send({ ...base, name: `idem-b-${key.slice(0, 8)}` });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toMatch(/different request body/i);
  });

  it("caches error responses for the same key and body", async () => {
    const key = randomUUID();
    const body = {
      name: `idem-err-${key.slice(0, 8)}`,
      type: "sensor",
      status: "invalid-status",
      lat: 42.1,
      lng: -71.1,
      installed_at: "2020-01-01",
      material: "copper",
      diameter_mm: 100,
    };

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);

    expect(first.status).toBe(400);

    const second = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);

    expect(second.status).toBe(400);
    expect(second.body).toEqual(first.body);
  });

  it("requires Idempotency-Key on POST /assets", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .send({
        name: "NWU-S-no-key",
        type: "sensor",
        status: "ok",
        lat: 42.1,
        lng: -71.1,
        installed_at: "2020-01-01",
        material: "copper",
        diameter_mm: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing Idempotency-Key/i);
  });

  it("rejects invalid Idempotency-Key format", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", "bad key!")
      .send({
        name: "NWU-S-test",
        type: "sensor",
        status: "ok",
        lat: 42.1,
        lng: -71.1,
        installed_at: "2020-01-01",
        material: "copper",
        diameter_mm: 100,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Idempotency-Key/i);
  });
});
