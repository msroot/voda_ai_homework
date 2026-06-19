CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    asset_schema  JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS assets (
    id            UUID PRIMARY KEY,
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'critical')),
    lat           DOUBLE PRECISION NOT NULL,
    lng           DOUBLE PRECISION NOT NULL,
    installed_at  DATE NOT NULL,
    data          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_id ON assets(tenant_id);
