import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSET_BASE_FIELDS,
  buildTenantAssetSchema,
  createDefaultAssetSchema,
  extendAssetSchema,
  normalizeAssetSchema,
  validateAssetSchemaBaseFields,
} from "../src/assets/mergeAssetSchema.js";

describe("createDefaultAssetSchema", () => {
  it("includes all base fields in properties and required", () => {
    const schema = createDefaultAssetSchema();

    for (const field of DEFAULT_ASSET_BASE_FIELDS) {
      expect(schema.properties).toHaveProperty(field);
      expect(schema.required).toContain(field);
    }
  });
});

describe("extendAssetSchema", () => {
  it("adds tenant fields under extra_fields while keeping base fields", () => {
    const current = createDefaultAssetSchema();
    const extended = extendAssetSchema(current, {
      properties: {
        material: { type: "string", minLength: 1 },
      },
      required: ["material"],
    });

    for (const field of DEFAULT_ASSET_BASE_FIELDS) {
      expect(extended.properties).toHaveProperty(field);
      expect(extended.required).toContain(field);
    }

    expect(extended.properties.extra_fields).toMatchObject({
      type: "object",
      properties: {
        material: { type: "string", minLength: 1 },
      },
      required: ["material"],
    });
    expect(extended.required).toContain("extra_fields");
  });

  it("ignores attempts to override base fields in an extension", () => {
    const current = createDefaultAssetSchema();
    const extended = extendAssetSchema(current, {
      properties: {
        tenant_id: { type: "string" },
        status: { type: "string", enum: ["custom"] },
        custom_field: { type: "number" },
      },
      required: ["tenant_id", "status", "custom_field"],
    });

    expect(extended.properties.tenant_id).toEqual(
      current.properties.tenant_id
    );
    expect(extended.properties.status).toEqual(current.properties.status);
    expect(extended.required).not.toContain("custom_field");
    expect(extended.properties.extra_fields).toMatchObject({
      properties: {
        custom_field: { type: "number" },
      },
      required: ["custom_field"],
    });
  });

  it("restores missing base fields when the current schema was corrupted", () => {
    const corrupted = {
      type: "object",
      properties: {
        extra_fields: {
          type: "object",
          properties: {
            ward: { type: "string" },
          },
          required: ["ward"],
        },
      },
      required: ["extra_fields"],
    };

    const extended = extendAssetSchema(corrupted, {
      properties: {
        zone: { type: "string" },
      },
      required: ["zone"],
    });

    for (const field of DEFAULT_ASSET_BASE_FIELDS) {
      expect(extended.properties).toHaveProperty(field);
      expect(extended.required).toContain(field);
    }

    expect(extended.properties.extra_fields).toMatchObject({
      properties: {
        ward: { type: "string" },
        zone: { type: "string" },
      },
      required: ["ward", "zone"],
    });
  });
});

describe("normalizeAssetSchema", () => {
  it("restores base fields on a corrupted schema without an extension", () => {
    const corrupted = {
      type: "object",
      properties: {
        extra_fields: {
          type: "object",
          properties: {
            ward: { type: "string" },
          },
          required: ["ward"],
        },
      },
      required: ["extra_fields"],
    };

    const normalized = normalizeAssetSchema(corrupted);

    for (const field of DEFAULT_ASSET_BASE_FIELDS) {
      expect(normalized.properties).toHaveProperty(field);
      expect(normalized.required).toContain(field);
    }

    expect(normalized.properties.extra_fields).toMatchObject({
      properties: {
        ward: { type: "string" },
      },
      required: ["ward"],
    });
  });
});

describe("validateAssetSchemaBaseFields", () => {
  it("accepts a schema with all base fields", () => {
    const result = validateAssetSchemaBaseFields(createDefaultAssetSchema());
    expect(result).toEqual({ valid: true });
  });

  it("rejects a schema missing base fields", () => {
    const result = validateAssetSchemaBaseFields({
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("properties.tenant_id is required");
      expect(result.errors).toContain("required must include tenant_id");
      expect(result.errors).toContain("required must include status");
    }
  });
});

describe("buildTenantAssetSchema", () => {
  it("creates a first version with base fields plus tenant extensions", () => {
    const schema = buildTenantAssetSchema({
      properties: {
        model: { type: "string", minLength: 1 },
      },
      required: ["model"],
    });

    for (const field of DEFAULT_ASSET_BASE_FIELDS) {
      expect(schema.properties).toHaveProperty(field);
      expect(schema.required).toContain(field);
    }

    expect(schema.properties.extra_fields).toMatchObject({
      properties: {
        model: { type: "string", minLength: 1 },
      },
      required: ["model"],
    });
  });
});
