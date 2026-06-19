import { tenantAssetSchemas } from "./tenantAssetSchemas.js";

export const tenants = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Northwind Utilities",
    slug: "northwind-utilities",
    created_at: "2024-01-15T10:00:00Z",
    asset_schema: tenantAssetSchemas["11111111-1111-4111-8111-111111111111"],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Beacon Sensors",
    slug: "beacon-sensors",
    created_at: "2024-03-22T09:30:00Z",
    asset_schema: tenantAssetSchemas["22222222-2222-4222-8222-222222222222"],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Civic Works",
    slug: "civic-works",
    created_at: "2024-06-10T14:15:00Z",
    asset_schema: tenantAssetSchemas["33333333-3333-4333-8333-333333333333"],
  },
] as const;
