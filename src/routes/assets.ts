import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { requireWrite } from "../middleware/authorize.js";
import {
  assetFilterSchema,
  assetWriteSchema,
  idParamSchema,
  type AssetFilter,
} from "../schemas.js";
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
  validate(assetFilterSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await listAssets(req.query as unknown as AssetFilter));
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
  requireWrite,
  validate(assetWriteSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createAsset(req.body));
  })
);

router.put(
  "/:id",
  requireWrite,
  validate(idParamSchema, "params"),
  validate(assetWriteSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateAsset(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  requireWrite,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteAsset(req.params.id);
    res.status(204).send();
  })
);

export default router;
