import pg from "pg";
import "dotenv/config";
import { tryGetTenantId } from "./context/authContext.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runInTransaction<T>(
  setup: (client: pg.PoolClient) => Promise<void>,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await setup(client);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return runInTransaction(
    async (client) => {
      const tenantId = tryGetTenantId();

      if (!tenantId) {
        throw new Error("Tenant context is required for this database operation");
      }

      await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
        tenantId,
      ]);
    },
    (client) => client.query<T>(text, params)
  );
}

export async function queryWithoutTenantContext<
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(text: string, params?: unknown[]): Promise<pg.QueryResult<T>> {
  return runInTransaction(
    async (client) => {
      await client.query(`SELECT set_config('app.bypass_rls', 'true', true)`);
    },
    (client) => client.query<T>(text, params)
  );
}

export default pool;
