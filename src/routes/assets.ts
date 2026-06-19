import { Router } from "express";
import { runHandler } from "../utils/asyncHandler.js";
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  updateAsset,
} from "../services/assetService.js";
import type { CreateAssetInput, UpdateAssetInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  await runHandler(async () => {
    res.json(await listAssets());
  }, res, next);
});

router.get("/:id", async (req, res, next) => {
  await runHandler(async () => {
    res.json(await getAsset(req.params.id));
  }, res, next);
});

router.post("/", async (req, res, next) => {
  await runHandler(async () => {
    const asset = await createAsset(req.body as CreateAssetInput);
    res.status(201).json(asset);
  }, res, next);
});

router.put("/:id", async (req, res, next) => {
  await runHandler(async () => {
    const asset = await updateAsset(req.params.id, req.body as UpdateAssetInput);
    res.json(asset);
  }, res, next);
});

router.delete("/:id", async (req, res, next) => {
  await runHandler(async () => {
    await deleteAsset(req.params.id);
    res.status(204).send();
  }, res, next);
});

export default router;
