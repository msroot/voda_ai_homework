# Multi-tenant Asset Service

Small Node.js API for managing tenants, users, and assets. Each tenant has its own users and assets; asset shape can vary per tenant via JSON Schema extensions.

**Stack:** Express, TypeScript, PostgreSQL, MongoDB, Redis.

For system design, patterns, security, and flows see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## How to run

### Docker (easiest)

```bash
docker compose up --build
```

- API: `http://localhost:3000`
- Seeds Postgres + Mongo on startup
- Runs API, outbox listener, and sync worker via PM2 inside the `app` container

### Local development

**Prerequisites:** Node 20+, Postgres 16, Redis 7, Mongo 7.

```bash
npm install
npm run seed          # reset DB + seed data
npm run dev           # API on :3000
npm run dev:listener  # outbox poller (separate terminal)
npm run dev:worker    # Mongo sync worker (separate terminal)
```

**Tests**

```bash
npm test
```

**Production build**

```bash
npm run build
npm start
npm run start:listener
npm run start:worker
# or: npm run start:pm2
```

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
| `PLATFORM_ADMIN_KEY` | For `POST /tenants` | Platform provisioning header |
| `SEED_ON_START` | Optional | `true` to seed when API starts |
| `SEED_PASSWORD` | Optional | Password for seeded users |

---

## Authentication

| Route type | Header |
|------------|--------|
| Tenant routes | `Authorization: Bearer <jwt>` from `POST /auth/login` |
| Platform `POST /tenants` | `x-admin-key: <PLATFORM_ADMIN_KEY>` (no JWT) |
| Public | `/health`, `/auth/login` — no auth |

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

**Errors:** `400` validation, `409` duplicate id, `403`.

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
