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

function isBaseField(key: string): boolean {
  return (DEFAULT_ASSET_BASE_FIELDS as readonly string[]).includes(key);
}

function defaultExtraFieldsSchema(): Record<string, unknown> {
  return asRecord(asRecord(defaultAssetSchema.properties).extra_fields);
}

function mergeExtraFieldsSchema(
  current: Record<string, unknown>,
  extension: SchemaObject
): Record<string, unknown> {
  const extensionProps = asRecord(extension.properties);
  const extensionRequired = asStringArray(extension.required).filter(
    (field) => !isBaseField(field) && field !== "extra_fields"
  );

  if (Object.keys(extensionProps).length === 0 && extensionRequired.length === 0) {
    return current;
  }

  const mergedProperties = {
    ...asRecord(current.properties),
    ...extensionProps,
  };

  const mergedRequired = [
    ...new Set([...asStringArray(current.required), ...extensionRequired]),
  ];

  return {
    type: "object",
    properties: mergedProperties,
    ...(mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties: false,
  };
}

function extractExtraFieldsExtension(extension: SchemaObject): SchemaObject {
  const extensionProps = asRecord(extension.properties);
  const extraFromNested = asRecord(extensionProps.extra_fields);
  const nestedProps = asRecord(extraFromNested.properties);
  const nestedRequired = asStringArray(extraFromNested.required);

  const flatProps: Record<string, unknown> = { ...nestedProps };
  const flatRequired: string[] = [...nestedRequired];

  for (const [key, value] of Object.entries(extensionProps)) {
    if (key === "extra_fields" || isBaseField(key)) {
      continue;
    }
    flatProps[key] = value;
  }

  for (const field of asStringArray(extension.required)) {
    if (!isBaseField(field) && field !== "extra_fields") {
      flatRequired.push(field);
    }
  }

  return {
    properties: flatProps,
    required: [...new Set(flatRequired)],
  };
}

export function extendAssetSchema(
  current: SchemaObject,
  extension: SchemaObject
): SchemaObject {
  const defaultProperties = asRecord(defaultAssetSchema.properties);
  const defaultRequired = asStringArray(defaultAssetSchema.required);
  const currentProperties = asRecord(current.properties);
  const extraFieldsExtension = extractExtraFieldsExtension(extension);

  const mergedExtraFields = mergeExtraFieldsSchema(
    asRecord(currentProperties.extra_fields) || defaultExtraFieldsSchema(),
    extraFieldsExtension
  );

  const properties = {
    ...currentProperties,
    ...defaultProperties,
    extra_fields: mergedExtraFields,
  };

  const required = [...new Set([...asStringArray(current.required), ...defaultRequired])];

  if (asStringArray(mergedExtraFields.required).length > 0) {
    required.push("extra_fields");
  }

  return {
    ...defaultAssetSchema,
    ...current,
    ...extension,
    properties,
    required: [...new Set(required)],
  };
}

export function createDefaultAssetSchema(): SchemaObject {
  return structuredClone(defaultAssetSchema) as SchemaObject;
}

export function buildTenantAssetSchema(extraFieldsExtension: SchemaObject): SchemaObject {
  const schema = createDefaultAssetSchema();
  const properties = asRecord(schema.properties);
  const extraExtension = extractExtraFieldsExtension(extraFieldsExtension);

  properties.extra_fields = mergeExtraFieldsSchema(
    defaultExtraFieldsSchema(),
    extraExtension
  );

  const required = [...asStringArray(schema.required)];

  if (asStringArray(asRecord(properties.extra_fields).required).length > 0) {
    required.push("extra_fields");
  }

  return {
    ...schema,
    properties,
    required: [...new Set(required)],
  };
}
