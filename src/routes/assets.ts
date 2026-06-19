import { Router } from "express";
import { randomUUID } from "crypto";
import { getTenantId, getUserId } from "../context/authContext.js";
import {
  createAsset,
  deleteAsset,
  findAssetByIdAndTenantId,
  findAssetsByTenantId,
  updateAsset,
} from "../repositories/assetRepository.js";
import { findTenantAssetSchema } from "../repositories/tenantRepository.js";
import { validateAssetData } from "../validateAsset.js";
import type { CreateAssetInput, UpdateAssetInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res) => {
  const assets = await findAssetsByTenantId(getTenantId());
  res.json(assets);
});

router.get("/:id", async (req, res) => {
  const asset = await findAssetByIdAndTenantId(req.params.id, getTenantId());

  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.json(asset);
});

router.post("/", async (req, res) => {
  const { data } = req.body as CreateAssetInput;
  const userId = getUserId();
  const tenantId = getTenantId();

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "data object is required" });
    return;
  }

  const schema = await findTenantAssetSchema(tenantId);
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
    const asset = await createAsset(
      assetData.id as string,
      tenantId,
      "pending",
      assetData,
      userId
    );
    res.status(201).json(asset);
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

  const existing = await findAssetByIdAndTenantId(req.params.id, tenantId);

  if (!existing) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  let nextData = existing.data;

  if (data !== undefined) {
    const schema = await findTenantAssetSchema(tenantId);
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

  const asset = await updateAsset(
    req.params.id,
    tenantId,
    data !== undefined ? JSON.stringify(nextData) : null,
    status ?? null
  );

  res.json(asset);
});

router.delete("/:id", async (req, res) => {
  const deleted = await deleteAsset(req.params.id, getTenantId());

  if (!deleted) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  res.status(204).send();
});

export default router;
