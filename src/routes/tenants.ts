import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db.js";
import {
  createDefaultAssetSchema,
  extendAssetSchema,
} from "../mergeAssetSchema.js";
import type { CreateTenantInput, UpdateTenantInput } from "../types.js";

const router = Router();

const tenantColumns = "id, name, slug, asset_schema, created_at";

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT ${tenantColumns} FROM tenants ORDER BY created_at`
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${tenantColumns} FROM tenants WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const { name, slug } = req.body as CreateTenantInput;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO tenants (id, name, slug, asset_schema) VALUES ($1, $2, $3, $4) RETURNING ${tenantColumns}`,
      [randomUUID(), name, slug, JSON.stringify(createDefaultAssetSchema())]
    );
    res.status(201).json(rows[0]);
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
      const existing = await pool.query(
        "SELECT asset_schema FROM tenants WHERE id = $1",
        [req.params.id]
      );

      if (existing.rows.length === 0) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      mergedAssetSchema = JSON.stringify(
        extendAssetSchema(existing.rows[0].asset_schema, asset_schema)
      );
    }

    const { rows } = await pool.query(
      `UPDATE tenants
       SET name = COALESCE($2, name),
           slug = COALESCE($3, slug),
           asset_schema = COALESCE($4, asset_schema)
       WHERE id = $1
       RETURNING ${tenantColumns}`,
      [req.params.id, name ?? null, slug ?? null, mergedAssetSchema]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "slug already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM tenants WHERE id = $1", [
    req.params.id,
  ]);

  if (rowCount === 0) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.status(204).send();
});

export default router;
