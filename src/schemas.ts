import { z } from "zod";

const userRoleSchema = z.enum(["admin", "editor", "viewer"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Tenant admins extend the asset schema with custom fields under extra_fields.
export const assetSchemaExtensionSchema = z.object({
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
});
export type AssetSchemaExtension = z.infer<typeof assetSchemaExtensionSchema>;

export const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  admin: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  asset_schema: assetSchemaExtensionSchema.optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.slug !== undefined,
    { message: "at least one of name or slug is required" }
  );
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  role: userRoleSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// email is immutable after creation, so it is intentionally not updatable here.
export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    role: userRoleSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.password !== undefined ||
      data.role !== undefined,
    { message: "at least one of name, password, or role is required" }
  );
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createAssetSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const assetFilterSchema = paginationSchema.extend({
  type: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
});
export type AssetFilter = z.infer<typeof assetFilterSchema>;

export const updateAssetSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
