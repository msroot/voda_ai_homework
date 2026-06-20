import { describe, expect, it } from "vitest";
import { createDefaultAssetSchema } from "../src/assets/mergeAssetSchema.js";
import {
  validateAssetData,
  validateAssetSchema,
} from "../src/assets/validateAsset.js";

describe("validateAssetSchema", () => {
  it("accepts the default asset JSON Schema", () => {
    const result = validateAssetSchema(createDefaultAssetSchema());
    expect(result).toEqual({ valid: true });
  });

  it("rejects an invalid JSON Schema", () => {
    const result = validateAssetSchema({
      type: "object",
      properties: {
        name: { type: "not-a-real-type" },
      },
    });

    expect(result.valid).toBe(false);
  });
});

describe("validateAssetData", () => {
  it("validates asset data against a stored schema", () => {
    const schema = createDefaultAssetSchema();
    const result = validateAssetData(schema, {
      id: "d8f56413-5be6-428e-98c2-67976142ea7d",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      name: "NWU-S-0001",
      type: "sensor",
      status: "ok",
      lat: 42.355415,
      lng: -71.12365,
      installed_at: "1999-02-28",
      extra_fields: {},
    });

    expect(result).toEqual({ valid: true });
  });

  it("rejects asset data missing required base fields", () => {
    const result = validateAssetData(createDefaultAssetSchema(), {
      name: "only-name",
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
