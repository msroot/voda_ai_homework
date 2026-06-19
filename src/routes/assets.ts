import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { createAssetSchema, idParamSchema, updateAssetSchema } from "../schemas.js";
import {
  createAsset,
  deleteAsset,
  getAsset,
  listAssets,
  updateAsset,
} from "../services/assetService.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listAssets());
  })
);

router.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await getAsset(req.params.id));
  })
);

router.post(
  "/",
  validate(createAssetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createAsset(req.body));
  })
);

router.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateAssetSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateAsset(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteAsset(req.params.id);
    res.status(204).send();
  })
);

export default router;
