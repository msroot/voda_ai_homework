import pg from "pg";
import "dotenv/config";
import { tryGetTenantId } from "./context/authContext.js";

if (!process.env.APP_DATABASE_URL) {
  console.warn(
    "APP_DATABASE_URL not set; falling back to DATABASE_URL. If that role is a " +
      "superuser or has BYPASSRLS, row-level tenant isolation will NOT be enforced."
  );
}

const pool = new pg.Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
});

async function runScoped<T extends pg.QueryResultRow>(
  bypassRls: boolean,
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (bypassRls) {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
    } else {
      const tenantId = tryGetTenantId();
      if (!tenantId) {
        throw new Error("Tenant context is required for this database operation");
      }
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [
        tenantId,
      ]);
    }

    const result = await client.query<T>(text, params);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return runScoped<T>(false, text, params);
}

export function queryWithoutTenantContext<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return runScoped<T>(true, text, params);
}

export default pool;
