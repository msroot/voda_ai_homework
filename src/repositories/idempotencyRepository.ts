import { getTenantId } from "../lib/authContext.js";
import { query } from "../clients/postgres.js";

const TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86400);
const PROCESSING_STALE_SECONDS = Number(
  process.env.IDEMPOTENCY_PROCESSING_TTL_SECONDS ?? 60
);

export interface StoredIdempotencyRecord {
  request_hash: string;
  status_code: number | null;
  response_body: unknown | null;
  expires_at: Date;
  created_at: Date;
}

export async function findIdempotencyRecord(
  key: string
): Promise<StoredIdempotencyRecord | null> {
  const { rows } = await query<StoredIdempotencyRecord>(
    `SELECT request_hash, status_code, response_body, expires_at, created_at
       FROM idempotency_keys
      WHERE key = $1`,
    [key]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.expires_at <= new Date()) {
    await deleteIdempotencyRecord(key);
    return null;
  }

  return row;
}

export async function tryInsertProcessingRecord(
  key: string,
  requestHash: string
): Promise<"acquired" | "conflict"> {
  const tenantId = getTenantId();
  const { rowCount } = await query(
    `INSERT INTO idempotency_keys (tenant_id, key, request_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4::int * INTERVAL '1 second'))
     ON CONFLICT (tenant_id, key) DO NOTHING`,
    [tenantId, key, requestHash, TTL_SECONDS]
  );

  return (rowCount ?? 0) > 0 ? "acquired" : "conflict";
}

export async function completeIdempotencyRecord(
  key: string,
  requestHash: string,
  statusCode: number,
  responseBody: unknown
): Promise<void> {
  await query(
    `UPDATE idempotency_keys
        SET status_code = $3,
            response_body = $4::jsonb,
            expires_at = NOW() + ($5::int * INTERVAL '1 second')
      WHERE key = $1
        AND request_hash = $2`,
    [key, requestHash, statusCode, JSON.stringify(responseBody), TTL_SECONDS]
  );
}

export async function deleteIdempotencyRecord(key: string): Promise<void> {
  await query("DELETE FROM idempotency_keys WHERE key = $1", [key]);
}

export function isProcessingStale(createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs > PROCESSING_STALE_SECONDS * 1000;
}
