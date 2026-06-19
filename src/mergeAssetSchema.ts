import { readFileSync } from "fs";
import { join } from "path";

type SchemaObject = Record<string, unknown>;

export const DEFAULT_ASSET_BASE_FIELDS = [
  "id",
  "tenant_id",
  "name",
  "type",
  "status",
  "lat",
  "lng",
  "installed_at",
] as const;

const baseFields = new Set<string>(DEFAULT_ASSET_BASE_FIELDS);

const defaultAssetSchema = JSON.parse(
  readFileSync(join(process.cwd(), "seed/schemas/default-asset.schema.json"), "utf-8")
) as SchemaObject;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function createDefaultAssetSchema(): SchemaObject {
  return structuredClone(defaultAssetSchema);
}

/**
 * Merges tenant-specific fields (`{ properties, required }`) into the schema's
 * `extra_fields`. Base fields are never added or removed.
 */
export function extendAssetSchema(
  current: SchemaObject,
  extension: SchemaObject
): SchemaObject {
  const properties = { ...asRecord(current.properties) };
  const currentExtra = asRecord(properties.extra_fields);

  const mergedProps = { ...asRecord(currentExtra.properties) };
  for (const [key, value] of Object.entries(asRecord(extension.properties))) {
    if (!baseFields.has(key) && key !== "extra_fields") {
      mergedProps[key] = value;
    }
  }

  const mergedRequired = [
    ...new Set([
      ...asStringArray(currentExtra.required),
      ...asStringArray(extension.required).filter(
        (field) => !baseFields.has(field) && field !== "extra_fields"
      ),
    ]),
  ];

  const hasExtraFields = Object.keys(mergedProps).length > 0;

  properties.extra_fields = {
    type: "object",
    properties: mergedProps,
    ...(mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties: !hasExtraFields,
  };

  const required = [...asStringArray(defaultAssetSchema.required)];
  if (mergedRequired.length > 0) {
    required.push("extra_fields");
  }

  return { ...defaultAssetSchema, properties, required };
}

export function buildTenantAssetSchema(extension: SchemaObject): SchemaObject {
  return extendAssetSchema(createDefaultAssetSchema(), extension);
}
