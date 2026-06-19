import { Router } from "express";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  createAssetSchema,
  idParamSchema,
  updateAssetSchema,
} from "../schemas.js";
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

router.get("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    res.json(await getAsset(req.params.id));
  }, res, next);
});

router.post("/", validateBody(createAssetSchema), async (req, res, next) => {
  await runHandler(async () => {
    const asset = await createAsset(req.body as CreateAssetInput);
    res.status(201).json(asset);
  }, res, next);
});

router.put(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateAssetSchema),
  async (req, res, next) => {
    await runHandler(async () => {
      const asset = await updateAsset(req.params.id, req.body as UpdateAssetInput);
      res.json(asset);
    }, res, next);
  }
);

router.delete("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    await deleteAsset(req.params.id);
    res.status(204).send();
  }, res, next);
});

export default router;
