# Multi-tenant Asset Service

See assignment implementation: Postgres (tenants, users, writes) + Mongo (asset read model) + outbox sync.

## Quick start

```bash
docker compose up --build
# or: npm run seed && npm run dev (+ dev:listener + dev:worker)
```

## Unified API responses

Every endpoint returns a **stable public shape**. Internal Postgres/Mongo differences are mapped in `src/api/`.

### Asset (create, update, get, list)

```json
{
  "id": "uuid-same-in-postgres-and-mongo",
  "tenant_id": "uuid",
  "schema_version": 1,
  "name": "NWU-S-0001",
  "type": "sensor",
  "status": "ok",
  "lat": 42.1,
  "lng": -71.1,
  "installed_at": "2020-01-01",
  "extra_fields": { "material": "copper" },
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-02T00:00:00.000Z"
}
```

- `id` is assigned on create (or pass `data.id` in the request body).
- Mongo stores the document under `_id` = that same UUID (not a separate Mongo id).
- `extra_fields` is used everywhere (API, Postgres validation, Mongo storage).
- Create/update return `updated_at: null` until the worker syncs; then GET returns a timestamp.

### User (create, update, get, list, login)

```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "name": "Amelia",
  "email": "amelia@northwind.test",
  "role": "admin",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

## Why `extra_fields` (not two names)

Tenant extensions use `extra_fields` consistently in the JSON Schema, API, Postgres `data` blob, and Mongo documents. Previously Mongo used `custom_fields` internally; that was removed so clients see one name.

## Postgres vs Mongo

| Postgres | Mongo |
|----------|-------|
| Tenants, users, schemas | Asset read documents |
| Asset writes (source of truth) | Filtered list/get |
| Outbox (`status: pending/synced`) | Same `id` as `_id` |

Writes: API → Postgres → worker → Mongo. Reads: Mongo (+ Redis cache).

## Tests

```bash
npm test
```

Seeded logins: `amelia@northwind.test` / `password123`
