import { createHash } from "crypto";

// Deterministic JSON: object keys are sorted recursively so two logically equal
// payloads always produce the same string (and therefore the same hash),
// regardless of property insertion order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(stableStringify(body ?? {})).digest("hex");
}

export interface IdempotencyKeyParts {
  tenantId: string;
  userId: string;
  method: string;
  path: string;
  clientKey: string;
  body: unknown;
}

/**
 * The value stored in `assets.idempotency_key`. It binds the client-supplied
 * `Idempotency-Key` header to the full request identity — tenant, user, HTTP
 * method, path, and a hash of the request body — so that the same key replayed
 * with the same request collides on `UNIQUE (tenant_id, idempotency_key)` (and
 * is rejected), while the same key with a different body/route does not.
 */
export function computeIdempotencyKey(parts: IdempotencyKeyParts): string {
  const material = [
    parts.tenantId,
    parts.userId,
    parts.method,
    parts.path,
    parts.clientKey,
    hashRequestBody(parts.body),
  ].join("\n");
  return createHash("sha256").update(material).digest("hex");
}
