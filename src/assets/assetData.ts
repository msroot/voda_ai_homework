import { DEFAULT_ASSET_BASE_FIELDS } from "./mergeAssetSchema.js";

const baseFieldSet = new Set<string>(DEFAULT_ASSET_BASE_FIELDS);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeAssetData(
  input: Record<string, unknown>,
  tenantId: string,
  id: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id,
    tenant_id: tenantId,
  };
  const extraFields: Record<string, unknown> = {};

  if (input.extra_fields) {
    Object.assign(extraFields, asRecord(input.extra_fields));
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === "extra_fields") {
      continue;
    }

    if (baseFieldSet.has(key)) {
      base[key] = value;
    } else {
      extraFields[key] = value;
    }
  }

  return {
    ...base,
    extra_fields: extraFields,
  };
}

export function mergeAssetData(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const extraFields = {
    ...asRecord(existing.extra_fields),
    ...asRecord(patch.extra_fields),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (key !== "extra_fields" && !baseFieldSet.has(key)) {
      extraFields[key] = value;
    }
  }

  const merged: Record<string, unknown> = {
    id: existing.id,
    tenant_id: existing.tenant_id,
    extra_fields: extraFields,
  };

  for (const source of [existing, patch]) {
    for (const [key, value] of Object.entries(source)) {
      if (key === "extra_fields" || !baseFieldSet.has(key)) {
        continue;
      }
      merged[key] = value;
    }
  }

  return merged;
}
