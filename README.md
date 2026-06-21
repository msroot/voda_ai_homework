# Multi-tenant Asset Service

Small Node.js API for managing tenants, users, and assets. Each tenant has its own users and assets; asset shape can vary per tenant via JSON Schema extensions.

**Stack:** Express, TypeScript, PostgreSQL, MongoDB, Redis.

For system design, patterns, security, and flows see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## How to run

### Docker

```bash
docker compose up --build
```

Wait until logs show the API is listening (e.g. `Server running on http://localhost:3000`).

**Verify:**

```bash
curl http://localhost:3000/health

curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"amelia@northwind.test","password":"password123"}'
```

- API: `http://localhost:3000`
- Seeds Postgres + Mongo on startup (`SEED_ON_START=true`)
- Runs API, outbox listener, and sync worker via PM2 inside the `app` container
- Seeded tenants are ready to use; `POST /tenants` needs `PLATFORM_ADMIN_KEY` (not set in compose by default — add to `docker-compose.yml` if you need platform provisioning)

### Local development

**Prerequisites:** Node 20+, Postgres 16, Redis 7, Mongo 7 (running locally or via compose for infra only).

**1. Environment** — export vars or put them in a `.env` file in the project root (`dotenv` loads it automatically):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/voda_ai_homework
APP_DATABASE_URL=postgres://voda_app:voda_app@localhost:5432/voda_ai_homework
REDIS_URL=redis://localhost:6379
MONGO_URL=mongodb://localhost:27017
MONGO_DB=voda_assets
JWT_SECRET=dev-secret-change-me
PLATFORM_ADMIN_KEY=dev-platform-key
```

`DATABASE_URL` must be a superuser — seed creates the schema and `voda_app` role. `APP_DATABASE_URL` is what the API uses (RLS enforced).

**2. Install and seed**

```bash
npm install
npm run seed    # reset DB, create schema, demo data — run before first API start
```

**3. Run all three processes** (listener + worker required for asset sync to Mongo):

```bash
npm run dev           # terminal 1 — API on :3000
npm run dev:listener  # terminal 2 — outbox poller
npm run dev:worker    # terminal 3 — Mongo sync worker
```

**Verify** (same as Docker):

```bash
curl http://localhost:3000/health
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"amelia@northwind.test","password":"password123"}'
```

**Tip:** Run only Postgres, Redis, and Mongo in Docker while developing the API locally:

```bash
docker compose up postgres redis mongo
```

Then use the env vars above with `localhost` hosts.

### Seeding

Resets and repopulates Postgres + Mongo with demo tenants, users, and assets.

```bash
npm run seed
```

**Requires:** running Postgres and Mongo; `DATABASE_URL` (superuser — creates schema and `voda_app` role).

**What it does:** runs `seed/reset.sql` and `seed/schema.sql`, inserts 3 tenants with users and sample assets, mirrors seeded assets into Mongo immediately (`synced` — no outbox wait). Also **flushes Redis** (cache, rate-limit counters, BullMQ jobs, platform idempotency keys) so nothing stale survives the reset.

Docker Compose sets `SEED_ON_START=true` so the API seeds on first boot. Override seeded user passwords with `SEED_PASSWORD` (default `password123`).

### Tests

```bash
npm test
```

**Requires (local):** Postgres, Redis, and Mongo running with the same connection env vars as dev (`DATABASE_URL`, `APP_DATABASE_URL`, `MONGO_URL`, `REDIS_URL`, `JWT_SECRET`, `PLATFORM_ADMIN_KEY`).

**What runs:** Vitest — integration tests in `tests/isolation.test.ts` (auth, RBAC, cross-tenant isolation via supertest + `createApp()`), plus unit tests for AJV schema merge/validation. The suite calls `runSeed()` in `beforeAll`, so each run resets the database.

CI (`.github/workflows/ci.yml`) runs `npm run build` and `npm test` on GitHub Actions with Postgres, Redis, and Mongo service containers — no local DB setup needed for PR checks.

### Seed logins

All seeded users use password `password123` (or `SEED_PASSWORD` if set).

| Tenant | Admin email |
|--------|-------------|
| Northwind Utilities | `amelia@northwind.test` |
| Beacon Sensors | `cora@beacon.test` |
| Civic Works | `eli@civicworks.test` |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Postgres superuser URL (schema + seed) |
| `APP_DATABASE_URL` | Yes | Postgres `voda_app` role (RLS-enforced API) |
| `MONGO_URL`, `MONGO_DB` | Yes | Mongo connection |
| `REDIS_URL` | Yes | Cache + rate limit + job queue |
| `JWT_SECRET` | Yes | Bearer token signing |
| `JWT_EXPIRES_IN` | Optional | Token lifetime (default `24h`) |
| `PLATFORM_ADMIN_KEY` | For `POST /tenants` | Platform provisioning header (`x-admin-key`) |
| `CACHE_TTL_SECONDS` | Optional | Redis cache TTL (default `60`) |
| `OUTBOX_POLL_INTERVAL_MS` | Optional | Listener poll interval (default `2000`) |
| `OUTBOX_BATCH_SIZE` | Optional | Max assets per poll (default `50`) |
| `OUTBOX_PROCESSING_STALE_SECONDS` | Optional | Reset stuck `processing` rows after this age (default `300`) |
| `RATE_LIMIT_WINDOW_MS` | Optional | Rate limit window (default `60000`) |
| `RATE_LIMIT_MAX` | Optional | Max requests per window (default `100`) |
| `IDEMPOTENCY_TTL_SECONDS` | Optional | Cached idempotency response TTL (default `86400`) |
| `SEED_ON_START` | Optional | `true` to seed when API starts |
| `SEED_PASSWORD` | Optional | Password for seeded users |

---

## Authentication

| Route type | Header |
|------------|--------|
| Tenant routes | `Authorization: Bearer <jwt>` from `POST /auth/login` |
| Platform `POST /tenants` | `x-admin-key: <PLATFORM_ADMIN_KEY>` (no JWT) |
| Public | `/health`, `/auth/login` — no auth |

See [Idempotency](#idempotency) for the `Idempotency-Key` header on creates.

---

## Idempotency

Clients can retry creates safely using the `Idempotency-Key` header. The server stores the first response and replays it when the same key and body are sent again.

| Endpoint | `Idempotency-Key` | Stored in |
|----------|-------------------|-----------|
| `POST /assets` | **Required** | Postgres — unique per `(tenant_id, key)` |
| `POST /users` | Optional | Postgres (same table) |
| `POST /tenants` | Optional | Redis (platform scope) |

**Recommendation:** keep the header **required on `POST /assets` only** — that is the main async write path where duplicate retries hurt most. Optional on user/tenant creates is sufficient for this service.

- Format: 1–255 characters (`letters`, `digits`, `_`, `-`).
- Same key + same JSON body → same response (no duplicate resource).
- Same key + different body → `409`.
- Missing on `POST /assets` → `400`.

**Example — create asset**

```bash
curl -s -X POST http://localhost:3000/assets \
  -H "Authorization: Bearer <token>" \
  -H "Idempotency-Key: 7f3a9c2e-b1c2-4d3e-8f4a-9b0c1d2e3f4a" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NWU-S-0001",
    "type": "sensor",
    "status": "ok",
    "lat": 42.1,
    "lng": -71.1,
    "installed_at": "2020-01-01",
    "material": "copper",
    "diameter_mm": 100
  }'
```

Retry the same curl after a timeout — you get the same `201` and the same `id`, not a second asset.

Optional body field `id` (UUID) is separate: it sets the asset id up front. `Idempotency-Key` protects the whole HTTP request on retry.

Details: [ARCHITECTURE.md §3.7](./ARCHITECTURE.md#37-http-idempotency-key-header).

---

## Error format

Most errors:

```json
{ "error": "Human-readable message" }
```

With extra detail (validation, asset schema errors):

```json
{
  "error": "Validation failed",
  "details": { ... }
}
```

| Status | When |
|--------|------|
| `400` | Invalid request body/query/params, asset validation failed |
| `401` | Missing/invalid JWT, bad login, bad platform key |
| `403` | RBAC denied (role not allowed) |
| `404` | Resource not found |
| `409` | Duplicate email, slug, or asset id |
| `429` | Rate limit exceeded |
| `500` | Server misconfiguration or unexpected error |

Validation errors (middleware) return `400` with Zod `details` before handlers run.

---

## Response consistency (POST vs GET)

Every create/update returns the same **response type** as the matching read endpoint. List endpoints wrap items in `{ data, pagination }`; single-resource endpoints return one object at the top level.

| Resource | Write response | Read response | Data source on write | Data source on read | Notes |
|----------|----------------|---------------|----------------------|---------------------|-------|
| **Users** | `UserResponse` | `UserResponse` | Postgres | Postgres | POST and GET return the same fields (same mapper). |
| **Assets** | `AssetResponse` | `AssetResponse` | Postgres | Mongo | Same type and field extraction. After sync, GET matches POST for `id`, `tenant_id`, `schema_version`, `name`, `type`, `status`, `lat`, `lng`, `installed_at`, `extra_fields`. On create/update, `updated_at`, `synced_at`, and `synced_by` are **null** until the worker syncs to Mongo; then GET fills them. |
| **Tenant** | `TenantResponse` | `TenantResponse` | Postgres | Postgres | `POST /tenants` wraps `{ tenant, user }`; `GET /tenants/current` returns `tenant` only. |

Create/update **request bodies** for users and assets are flat JSON at the top level (same style). List endpoints still wrap results in `{ data, pagination }`.

---

## Endpoints

### Health

#### `GET /health`

No auth.

**Response `200`**

```json
{ "status": "ok" }
```

---

### Auth

#### `POST /auth/login`

**Body**

```json
{
  "email": "amelia@northwind.test",
  "password": "password123"
}
```

**Response `200`**

```json
{
  "token": "<jwt>",
  "user": {
    "id": "uuid",
    "tenant_id": "uuid",
    "name": "Amelia Chen",
    "email": "amelia@northwind.test",
    "role": "admin",
    "created_at": "2024-01-15T10:00:00.000Z"
  }
}
```

**Errors:** `401` invalid credentials, `400` validation failed, `429` rate limit.

---

### Tenants

#### `POST /tenants` — platform onboarding

**Auth:** `x-admin-key` (not JWT).

**Body**

```json
{
  "name": "My Org",
  "slug": "my-org",
  "admin": {
    "name": "Admin User",
    "email": "admin@myorg.test",
    "password": "secret"
  },
  "asset_schema": {
    "properties": { "material": { "type": "string" } },
    "required": ["material"]
  }
}
```

`asset_schema` is optional; defaults to base asset schema only.

**Response `201`**

```json
{
  "tenant": {
    "id": "uuid",
    "name": "My Org",
    "slug": "my-org",
    "schema_version": "v_1",
    "asset_schema": { ... },
    "created_at": "..."
  },
  "user": { ... UserResponse ... }
}
```

**Errors:** `401` bad platform key, `409` slug or admin email exists, `400` invalid schema.

---

#### `GET /tenants/current`

**Auth:** Bearer JWT.

**Response `200`:** `TenantResponse` (same shape as `tenant` above).

**Errors:** `401`, `404` tenant not found, `500` schema missing.

---

#### `PUT /tenants/current`

**Auth:** Bearer JWT, **admin** only.

**Body** (at least one field)

```json
{
  "name": "New Name",
  "slug": "new-slug"
}
```

**Response `200`:** `TenantResponse`.

**Errors:** `403` not admin, `409` slug conflict, `400` validation, `404`.

---

### Users

All routes require Bearer JWT. Tenant-scoped via RLS.

| Role | List/Get | Create/Update/Delete |
|------|----------|----------------------|
| admin | Yes | Yes |
| editor | Yes | No |
| viewer | Yes | No |

#### `GET /users`

**Query:** `limit` (1–100, default 20), `offset` (default 0).

**Response `200`**

```json
{
  "data": [ { ... UserResponse ... } ],
  "pagination": { "limit": 20, "offset": 0, "total": 4 }
}
```

---

#### `GET /users/:id`

**Params:** `id` — UUID.

**Response `200`:** `UserResponse`.

**Errors:** `404` user not found.

---

#### `POST /users`

**Auth:** admin.

**Body**

```json
{
  "name": "Jane Doe",
  "email": "jane@northwind.test",
  "password": "secret",
  "role": "editor"
}
```

`role`: `admin` | `editor` | `viewer`.

**Response `201`** — single user object (not an array; use `GET /users` for the list):

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Jane Doe",
  "email": "jane@northwind.test",
  "role": "editor",
  "created_at": "2026-06-20T12:00:00.000Z"
}
```

**Errors:** `403`, `409` email exists, `400`.

---

#### `PUT /users/:id`

**Auth:** admin (non-admins cannot change `role`).

**Body** (at least one)

```json
{
  "name": "Jane D.",
  "password": "newsecret",
  "role": "viewer"
}
```

**Response `200`:** `UserResponse`.

**Errors:** `403`, `404`, `400`.

---

#### `DELETE /users/:id`

**Auth:** admin.

**Response `204`** empty body.

**Errors:** `403`, `404`.

---

### Assets

Reads use **Mongo** (+ Redis cache). Writes go to **Postgres** first; Mongo updates asynchronously (see ARCHITECTURE.md).

Create/update request bodies are flat fields at the top level (like users). The API maps them into the `data` JSON column in Postgres internally.

| Role | List/Get | Create/Update/Delete |
|------|----------|----------------------|
| admin | Yes | Yes |
| editor | Yes | Yes |
| viewer | Yes | No |

#### `GET /assets`

**Query:** `limit`, `offset`, optional `type`, optional `status` (`ok` | `warning` | `critical`).

**Response `200`**

```json
{
  "data": [ { ... AssetResponse ... } ],
  "pagination": { "limit": 20, "offset": 0, "total": 100 }
}
```

---

#### `GET /assets/:id`

**Params:** `id` — UUID.

**Response `200`:** `AssetResponse`.

**Errors:** `404` (not in Mongo yet if still syncing).

---

#### `POST /assets`

**Auth:** admin or editor.

**Headers:** `Idempotency-Key` — **required** (see [Idempotency](#idempotency)).

**Body**

```json
{
  "name": "NWU-S-0001",
  "type": "sensor",
  "status": "ok",
  "lat": 42.1,
  "lng": -71.1,
  "installed_at": "2020-01-01",
  "material": "copper",
  "diameter_mm": 100
}
```

Optional `id` (UUID). Tenant-specific fields can be sent at the top level (as above) or grouped in `extra_fields`. Required fields depend on the tenant JSON Schema.

**Response `201`** — `AssetResponse` (see shape below). `synced_at`, `synced_by`, and `updated_at` are **null** until the worker syncs to Mongo.

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "schema_version": "v_1",
  "name": "NWU-S-0001",
  "type": "sensor",
  "status": "ok",
  "lat": 42.1,
  "lng": -71.1,
  "installed_at": "2020-01-01",
  "extra_fields": { "material": "copper", "diameter_mm": 100 },
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": null,
  "synced_at": null,
  "synced_by": null
}
```

**Errors:** `400` validation or missing/invalid `Idempotency-Key`, `409` duplicate id or idempotency conflict, `403`.

---

#### `PUT /assets/:id`

**Auth:** admin or editor.

**Body** (at least one field) — partial update, same flat field names as create.

**Response `200`:** `AssetResponse` (sync fields null until worker runs).

**Errors:** `404`, `400`, `403`.

---

#### `DELETE /assets/:id`

**Auth:** admin or editor.

**Response `204`**.

**Errors:** `404`, `403`.

---

### AssetResponse shape

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "schema_version": "v_1",
  "name": "NWU-S-0001",
  "type": "sensor",
  "status": "ok",
  "lat": 42.1,
  "lng": -71.1,
  "installed_at": "2020-01-01",
  "extra_fields": { "material": "copper" },
  "created_at": "2024-01-15T10:00:00.000Z",
  "updated_at": "2026-06-20T12:00:00.000Z",
  "synced_at": "2026-06-20T12:00:00.000Z",
  "synced_by": "uuid-of-user-who-triggered-write"
}
```

After create/update, `synced_at`, `synced_by`, and `updated_at` are `null` until the sync worker finishes.

---

### Reports

#### `GET /reports/overview`

**Auth:** Bearer JWT (any role in tenant).

**Response `200`**

```json
{
  "tenant": { "id": "uuid", "name": "...", "slug": "..." },
  "users": {
    "total": 4,
    "by_role": { "admin": 1, "editor": 2, "viewer": 1 }
  },
  "asset_schema": {
    "versions_count": 1,
    "versions": ["v_1"],
    "current_version": "v_1"
  },
  "assets": {
    "total": 100,
    "by_status": { "ok": 71, "warning": 21, "critical": 8 },
    "by_schema_version": { "v_1": 100 }
  },
  "generated_at": "2026-06-20T12:00:00.000Z"
}
```

Data merged from Postgres (tenant, users, schema) and Mongo (asset aggregates).

**Errors:** `401`, `404`, `500`.

**Author:** [Yannis Kolovos](https://msroot.me/) · June 2026
