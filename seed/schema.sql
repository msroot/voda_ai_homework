CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    asset_schema  JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Soft delete: when set, the user is treated as deleted but the row is kept
    -- so references (e.g. assets.created_by) stay valid and history is preserved.
    deleted_at      TIMESTAMPTZ
);

-- Email is unique among active (non-soft-deleted) users only, so an email freed
-- by a soft delete can be reused by a new user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active
    ON users(email) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS assets (
    id          UUID PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Outbox sync state for the read model: 'pending' (awaiting the worker) or
    -- 'synced'. The row is the outbox entry, so the write and the sync marker
    -- commit together in one transaction.
    status      TEXT NOT NULL DEFAULT 'pending',
    -- Operation the worker must apply to MongoDB: 'upsert' (create/update) or
    -- 'delete' (a tombstone; the worker removes the Mongo doc, then hard-deletes
    -- this row).
    action      TEXT NOT NULL DEFAULT 'upsert',
    data        JSONB NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant scoping (RLS filters every query by tenant_id).
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_id ON assets(tenant_id);

-- Paginated user listing: tenant scope + created_at ordering.
CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenant_id, created_at);

-- Note: login looks up an active user by email (bypasses RLS). The partial
-- unique index idx_users_email_active above already provides the backing index,
-- so no separate one is needed here.

-- Outbox poll: find rows still awaiting sync, oldest first. Partial index keeps
-- it tiny since most rows are already 'synced'.
CREATE INDEX IF NOT EXISTS idx_assets_pending
    ON assets(created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION app_current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_bypass_rls()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.bypass_rls', true), '') = 'true';
$$ LANGUAGE sql STABLE;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_tenant_isolation ON tenants;
CREATE POLICY tenants_tenant_isolation ON tenants
  FOR ALL
  USING (app_bypass_rls() OR id = app_current_tenant_id())
  WITH CHECK (app_bypass_rls() OR id = app_current_tenant_id());

DROP POLICY IF EXISTS users_tenant_isolation ON users;
CREATE POLICY users_tenant_isolation ON users
  FOR ALL
  USING (app_bypass_rls() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant_id());

DROP POLICY IF EXISTS assets_tenant_isolation ON assets;
CREATE POLICY assets_tenant_isolation ON assets
  FOR ALL
  USING (app_bypass_rls() OR tenant_id = app_current_tenant_id())
  WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant_id());

-- Dedicated non-superuser application role. RLS is bypassed by superusers and by
-- BYPASSRLS/owner roles, so the app must connect as a plain role for the policies
-- above to actually take effect.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'voda_app') THEN
    CREATE ROLE voda_app LOGIN PASSWORD 'voda_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO voda_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO voda_app;
