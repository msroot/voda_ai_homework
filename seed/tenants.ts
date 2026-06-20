import { buildTenantAssetSchema } from "../src/lib/assetSchema.js";

const northwindId = "11111111-1111-4111-8111-111111111111";
const beaconId = "22222222-2222-4222-8222-222222222222";
const civicId = "33333333-3333-4333-8333-333333333333";

const tenantAssetSchemas: Record<string, Record<string, unknown>> = {
  [northwindId]: buildTenantAssetSchema({
    properties: {
      material: { type: "string", minLength: 1 },
      diameter_mm: { type: "number", minimum: 0 },
    },
    required: ["material", "diameter_mm"],
  }),
  [beaconId]: buildTenantAssetSchema({
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
  [civicId]: buildTenantAssetSchema({
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

export const tenants = [
  {
    id: northwindId,
    name: "Northwind Utilities",
    slug: "northwind-utilities",
    created_at: "2024-01-15T10:00:00Z",
    asset_schema: tenantAssetSchemas[northwindId],
  },
  {
    id: beaconId,
    name: "Beacon Sensors",
    slug: "beacon-sensors",
    created_at: "2024-03-22T09:30:00Z",
    asset_schema: tenantAssetSchemas[beaconId],
  },
  {
    id: civicId,
    name: "Civic Works",
    slug: "civic-works",
    created_at: "2024-06-10T14:15:00Z",
    asset_schema: tenantAssetSchemas[civicId],
  },
] as const;
