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

function assetBody(suffix: string) {
  return {
    name: `idem-${suffix}`,
    type: "sensor",
    status: "ok",
    lat: 42.1,
    lng: -71.1,
    installed_at: "2020-01-01",
    material: "copper",
    diameter_mm: 100,
  };
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
  ]);
});

describe("POST /assets idempotency key", () => {
  it("requires the Idempotency-Key header", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .send(assetBody(randomUUID().slice(0, 8)));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing Idempotency-Key/i);
  });

  it("rejects an invalid Idempotency-Key format", async () => {
    const res = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", "bad key!")
      .send(assetBody(randomUUID().slice(0, 8)));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid Idempotency-Key/i);
  });

  it("rejects replaying the same key with the same body (409)", async () => {
    const key = randomUUID();
    const body = assetBody(key.slice(0, 8));

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    const replay = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(body);
    expect(replay.status).toBe(409);
    expect(replay.body.error).toMatch(/duplicate request/i);
  });

  it("allows the same key with a different body", async () => {
    const key = randomUUID();

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(assetBody(`${key.slice(0, 8)}-a`));
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send(assetBody(`${key.slice(0, 8)}-b`));
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("allows different keys with the same body", async () => {
    const body = assetBody(randomUUID().slice(0, 8));

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", randomUUID())
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("treats the key as identical regardless of body property order (409)", async () => {
    const key = randomUUID();

    const first = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send({
        name: `order-${key.slice(0, 8)}`,
        type: "sensor",
        status: "ok",
        lat: 42.1,
        lng: -71.1,
        installed_at: "2020-01-01",
        material: "copper",
      });
    expect(first.status).toBe(201);

    const reordered = await request(app)
      .post("/assets")
      .set(auth(editorToken))
      .set("Idempotency-Key", key)
      .send({
        material: "copper",
        installed_at: "2020-01-01",
        lng: -71.1,
        lat: 42.1,
        status: "ok",
        type: "sensor",
        name: `order-${key.slice(0, 8)}`,
      });
    expect(reordered.status).toBe(409);
  });
});
