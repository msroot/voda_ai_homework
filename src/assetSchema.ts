import { readFileSync } from "fs";
import { join } from "path";
import Ajv2020 from "ajv/dist/2020.js";
import { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

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
const baseFieldSet = new Set<string>(DEFAULT_ASSET_BASE_FIELDS);

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

function baseFieldProperties(): Record<string, unknown> {
  const defaultProperties = asRecord(defaultAssetSchema.properties);
  const properties: Record<string, unknown> = {};

  for (const field of DEFAULT_ASSET_BASE_FIELDS) {
    if (field in defaultProperties) {
      properties[field] = defaultProperties[field];
    }
  }

  return properties;
}

/**
 * Merges tenant-specific fields (`{ properties, required }`) into the schema's
 * `extra_fields`. Base fields are always taken from the default schema and
 * cannot be added, removed, or overridden by tenant extensions.
 */
export function extendAssetSchema(
  current: SchemaObject,
  extension: SchemaObject
): SchemaObject {
  const properties = baseFieldProperties();
  const currentExtra = asRecord(asRecord(current.properties).extra_fields);

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

/** Re-applies base field definitions and preserves tenant extra_fields. */
export function normalizeAssetSchema(schema: SchemaObject): SchemaObject {
  return extendAssetSchema(schema, {});
}

export function validateAssetSchemaBaseFields(
  schema: SchemaObject
): { valid: true } | { valid: false; errors: string[] } {
  const properties = asRecord(schema.properties);
  const required = asStringArray(schema.required);
  const errors: string[] = [];

  for (const field of DEFAULT_ASSET_BASE_FIELDS) {
    if (!(field in properties)) {
      errors.push(`properties.${field} is required`);
    }
    if (!required.includes(field)) {
      errors.push(`required must include ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return ["Invalid asset data"];
  }

  return errors.map((error) => {
    const path = error.instancePath || "data";
    return `${path}: ${error.message ?? "invalid"}`;
  });
}

function compileAssetValidator(schema: Record<string, unknown>) {
  const compileSchema = structuredClone(schema);
  delete compileSchema.$id;
  delete compileSchema.$schema;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(compileSchema);
}

export function validateAssetSchema(
  schema: Record<string, unknown>
): { valid: true } | { valid: false; errors: string[] } {
  try {
    compileAssetValidator(schema);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON Schema";
    return { valid: false, errors: [message] };
  }
}

export function validateAssetData(
  schema: Record<string, unknown>,
  data: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const validate = compileAssetValidator(schema);
  const valid = validate(data);

  if (!valid) {
    return { valid: false, errors: formatErrors(validate.errors) };
  }

  return { valid: true };
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
