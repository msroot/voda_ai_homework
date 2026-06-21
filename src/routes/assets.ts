import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { requireWrite } from "../middleware/authorize.js";
import { AppError } from "../lib/appError.js";
import {
  assetFilterSchema,
  assetUpdateSchema,
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

// Client idempotency key supplied per request. 1–255 chars: letters, digits, _ , -.
const IDEMPOTENCY_KEY_PATTERN = /^[\w-]{1,255}$/;

router.get(
  "/",
  validateRequest(assetFilterSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await listAssets(req.query as unknown as AssetFilter));
  })
);

router.get(
  "/:id",
  validateRequest(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await getAsset(req.params.id));
  })
);

router.post(
  "/",
  requireWrite,
  validateRequest(assetWriteSchema),
  asyncHandler(async (req, res) => {
    const clientKey = req.header("Idempotency-Key");
    if (!clientKey) {
      throw new AppError(400, "Missing Idempotency-Key header");
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(clientKey)) {
      throw new AppError(400, "Invalid Idempotency-Key");
    }

    const asset = await createAsset(req.body, {
      clientKey,
      method: req.method,
      path: req.originalUrl.split("?")[0],
    });
    res.status(201).json(asset);
  })
);

router.put(
  "/:id",
  requireWrite,
  validateRequest(idParamSchema, "params"),
  validateRequest(assetUpdateSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateAsset(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  requireWrite,
  validateRequest(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteAsset(req.params.id);
    res.status(204).send();
  })
);

export default router;
