import { buildTenantAssetSchema } from "../src/mergeAssetSchema.js";

export const TENANT_IDS = {
  northwind: "11111111-1111-4111-8111-111111111111",
  beacon: "22222222-2222-4222-8222-222222222222",
  civic: "33333333-3333-4333-8333-333333333333",
} as const;

export const tenantAssetSchemas: Record<string, Record<string, unknown>> = {
  [TENANT_IDS.northwind]: buildTenantAssetSchema({
    properties: {
      material: { type: "string", minLength: 1 },
      diameter_mm: { type: "number", minimum: 0 },
    },
    required: ["material", "diameter_mm"],
  }),
  [TENANT_IDS.beacon]: buildTenantAssetSchema({
    properties: {
      model: { type: "string", minLength: 1 },
      telemetry: {
        type: "object",
        required: ["sample_rate_seconds", "last_reading_at", "units"],
        properties: {
          sample_rate_seconds: { type: "number", minimum: 1 },
          last_reading_at: { type: ["string", "null"], format: "date-time" },
          units: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
    required: ["model", "telemetry"],
  }),
  [TENANT_IDS.civic]: buildTenantAssetSchema({
    properties: {
      ward: { type: "string", minLength: 1 },
      inspections: {
        type: "array",
        items: {
          type: "object",
          required: ["date", "notes", "inspector_id"],
          properties: {
            date: { type: "string", format: "date" },
            notes: { type: "string" },
            inspector_id: { type: "string", format: "uuid" },
          },
          additionalProperties: false,
        },
      },
    },
    required: ["ward", "inspections"],
  }),
};
