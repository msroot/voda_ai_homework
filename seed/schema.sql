CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable tenant asset schema. Inserted once at tenant creation (version 1).
-- Assets are validated against and pinned to this version.
CREATE TABLE IF NOT EXISTS asset_schemas (
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    version     INT NOT NULL CHECK (version = 1),
    schema      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, version),
    UNIQUE (tenant_id)
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
    -- Asset schema version this asset was validated against (always 1).
    schema_version INT NOT NULL,
    data        JSONB NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    modified_by UUID NOT NULL REFERENCES users(id),
    synced_at   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id, schema_version)
        REFERENCES asset_schemas(tenant_id, version)
);

-- Tenant scoping (RLS filters every query by tenant_id).
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_id ON assets(tenant_id);

-- Paginated user listing: tenant scope + created_at ordering.
CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenant_id, created_at);

-- Active users only (list + report GROUP BY role): smaller than idx_users_tenant_created.
CREATE INDEX IF NOT EXISTS idx_users_tenant_active_created
  ON users(tenant_id, created_at) WHERE deleted_at IS NULL;

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

-- asset_schemas rows are insert-once: no updates or deletes (even for superusers).
CREATE OR REPLACE FUNCTION asset_schemas_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'asset_schemas rows cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS asset_schemas_no_update ON asset_schemas;
CREATE TRIGGER asset_schemas_no_update
  BEFORE UPDATE ON asset_schemas
  FOR EACH ROW EXECUTE FUNCTION asset_schemas_immutable();

DROP TRIGGER IF EXISTS asset_schemas_no_delete ON asset_schemas;
CREATE TRIGGER asset_schemas_no_delete
  BEFORE DELETE ON asset_schemas
  FOR EACH ROW EXECUTE FUNCTION asset_schemas_immutable();

-- assets.tenant_id and assets.schema_version are set at creation and never change.
CREATE OR REPLACE FUNCTION assets_identity_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'assets.tenant_id is immutable';
  END IF;
  IF NEW.schema_version IS DISTINCT FROM OLD.schema_version THEN
    RAISE EXCEPTION 'assets.schema_version is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assets_identity_immutable ON assets;
CREATE TRIGGER assets_identity_immutable
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_identity_immutable();

-- users.tenant_id is set at creation and never changes.
CREATE OR REPLACE FUNCTION users_tenant_id_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'users.tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_tenant_id_immutable ON users;
CREATE TRIGGER users_tenant_id_immutable
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_tenant_id_immutable();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE asset_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_schemas FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_tenant_isolation ON tenants;
CREATE POLICY tenants_tenant_isolation ON tenants
  FOR ALL
  USING (app_bypass_rls() OR id = app_current_tenant_id())
  WITH CHECK (app_bypass_rls() OR id = app_current_tenant_id());

DROP POLICY IF EXISTS asset_schemas_tenant_isolation ON asset_schemas;
DROP POLICY IF EXISTS asset_schemas_select ON asset_schemas;
DROP POLICY IF EXISTS asset_schemas_insert ON asset_schemas;
CREATE POLICY asset_schemas_select ON asset_schemas
  FOR SELECT
  USING (app_bypass_rls() OR tenant_id = app_current_tenant_id());
CREATE POLICY asset_schemas_insert ON asset_schemas
  FOR INSERT
  WITH CHECK (app_bypass_rls());

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
REVOKE UPDATE, DELETE ON asset_schemas FROM voda_app;
