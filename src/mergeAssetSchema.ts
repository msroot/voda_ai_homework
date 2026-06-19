import defaultAssetSchema from "./defaultAssetSchema.js";

type SchemaObject = Record<string, unknown>;

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
  return structuredClone(defaultAssetSchema) as SchemaObject;
}
