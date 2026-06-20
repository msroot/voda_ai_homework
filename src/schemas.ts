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

export const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  admin: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(1),
  }),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

// asset_schema is passed through as-is (only checked to be an object); its JSON
// Schema structure is intentionally not validated by zod.
export const updateTenantSchema = z
  .object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    asset_schema: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.slug !== undefined ||
      data.asset_schema !== undefined,
    { message: "at least one of name, slug, or asset_schema is required" }
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

export const updateAssetSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).optional(),
    status: z.string().min(1).optional(),
  })
  .refine((data) => data.data !== undefined || data.status !== undefined, {
    message: "at least one of data or status is required",
  });
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
