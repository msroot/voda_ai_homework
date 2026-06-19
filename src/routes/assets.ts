import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db.js";
import { getTenantId, getUserId } from "../context/authContext.js";
import { validateAssetData } from "../validateAsset.js";
import type { CreateAssetInput, UpdateAssetInput } from "../types.js";

const router = Router();

const assetColumns = "id, tenant_id, status, data, created_by, created_at";

async function getTenantSchema(
  tenantId: string
): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<{ asset_schema: Record<string, unknown> }>(
    "SELECT asset_schema FROM tenants WHERE id = $1",
    [tenantId]
  );
  return rows[0]?.asset_schema ?? null;
}

router.get("/", async (_req, res) => {
  const tenantId = getTenantId();

  const { rows } = await pool.query(
    `SELECT ${assetColumns} FROM assets WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${assetColumns} FROM assets WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, getTenantId()]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const { data } = req.body as CreateAssetInput;
  const userId = getUserId();
  const tenantId = getTenantId();

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "data object is required" });
    return;
  }

  const schema = await getTenantSchema(tenantId);
  if (!schema) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const assetData = {
    ...data,
    tenant_id: tenantId,
    id: typeof data.id === "string" ? data.id : randomUUID(),
  };

  const validation = validateAssetData(schema, assetData);
  if (!validation.valid) {
    res.status(400).json({ error: "Asset validation failed", details: validation.errors });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO assets (id, tenant_id, status, data, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${assetColumns}`,
      [assetData.id, tenantId, "pending", JSON.stringify(assetData), userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("duplicate key")) {
      res.status(409).json({ error: "Asset id already exists" });
      return;
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { data, status } = req.body as UpdateAssetInput;
  const tenantId = getTenantId();

  if (data === undefined && status === undefined) {
    res.status(400).json({ error: "at least one of data or status is required" });
    return;
  }

  if (data !== undefined && (typeof data !== "object" || data === null || Array.isArray(data))) {
    res.status(400).json({ error: "data must be a JSON object" });
    return;
  }

  const existing = await pool.query(
    `SELECT ${assetColumns} FROM assets WHERE id = $1 AND tenant_id = $2`,
    [req.params.id, tenantId]
  );

  if (existing.rows.length === 0) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  const asset = existing.rows[0];
  let nextData = asset.data;

  if (data !== undefined) {
    const schema = await getTenantSchema(tenantId);
    if (!schema) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    nextData = {
      ...data,
      tenant_id: tenantId,
      id: req.params.id,
    };

    const validation = validateAssetData(schema, nextData);
    if (!validation.valid) {
      res.status(400).json({ error: "Asset validation failed", details: validation.errors });
      return;
    }
  }

  const { rows } = await pool.query(
    `UPDATE assets
     SET data = COALESCE($2, data),
         status = COALESCE($3, status)
     WHERE id = $1 AND tenant_id = $4
     RETURNING ${assetColumns}`,
    [
      req.params.id,
      data !== undefined ? JSON.stringify(nextData) : null,
      status ?? null,
      tenantId,
    ]
  );

  res.json(rows[0]);
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query(
    "DELETE FROM assets WHERE id = $1 AND tenant_id = $2",
    [req.params.id, getTenantId()]
  );

  if (rowCount === 0) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.status(204).send();
});

export default router;
