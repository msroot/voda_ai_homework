import { readFileSync } from "fs";
import { join } from "path";

type SchemaObject = Record<string, unknown>;

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

export function extendAssetSchema(
  current: SchemaObject,
  extension: SchemaObject
): SchemaObject {
  const defaultProperties = asRecord(defaultAssetSchema.properties);
  const defaultRequired = asStringArray(defaultAssetSchema.required);

  const properties = {
    ...asRecord(current.properties),
    ...asRecord(extension.properties),
    ...defaultProperties,
  };

  const required = [
    ...new Set([
      ...asStringArray(current.required),
      ...asStringArray(extension.required),
      ...defaultRequired,
    ]),
  ];

  return {
    ...defaultAssetSchema,
    ...current,
    ...extension,
    properties,
    required,
  };
}

export function createDefaultAssetSchema(): SchemaObject {
  return structuredClone(defaultAssetSchema);
}

export function buildTenantAssetSchema(extension: SchemaObject): SchemaObject {
  return extendAssetSchema(createDefaultAssetSchema(), extension);
}
