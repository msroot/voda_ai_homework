import { Router } from "express";
import { randomUUID } from "crypto";
import {
  createTenant,
  deleteTenant,
  findAllTenants,
  findTenantById,
  updateTenant,
} from "../repositories/tenantRepository.js";
import {
  createDefaultAssetSchema,
  extendAssetSchema,
} from "../mergeAssetSchema.js";
import type { CreateTenantInput, UpdateTenantInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res) => {
  const tenants = await findAllTenants();
  res.json(tenants);
});

router.get("/:id", async (req, res) => {
  const tenant = await findTenantById(req.params.id);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.post("/", async (req, res) => {
  const { name, slug } = req.body as CreateTenantInput;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  try {
    const tenant = await createTenant(
      randomUUID(),
      name,
      slug,
      createDefaultAssetSchema()
    );
    res.status(201).json(tenant);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "slug already exists" });
      return;
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { name, slug, asset_schema } = req.body as UpdateTenantInput;

  if (name === undefined && slug === undefined && asset_schema === undefined) {
    res.status(400).json({
      error: "at least one of name, slug, or asset_schema is required",
    });
    return;
  }

  if (
    asset_schema !== undefined &&
    (typeof asset_schema !== "object" || asset_schema === null || Array.isArray(asset_schema))
  ) {
    res.status(400).json({ error: "asset_schema must be a JSON object" });
    return;
  }

  try {
    let mergedAssetSchema: string | null = null;

    if (asset_schema !== undefined) {
      const existing = await findTenantById(req.params.id);

      if (!existing) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      mergedAssetSchema = JSON.stringify(
        extendAssetSchema(existing.asset_schema, asset_schema)
      );
    }

    const tenant = await updateTenant(
      req.params.id,
      name ?? null,
      slug ?? null,
      mergedAssetSchema
    );

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(tenant);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "slug already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await deleteTenant(req.params.id);

  if (!deleted) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.status(204).send();
});

export default router;
