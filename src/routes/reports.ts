import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAssetStatusReport } from "../services/reportService.js";

const router = Router();

router.get(
  "/asset-status",
  asyncHandler(async (_req, res) => {
    res.json(await getAssetStatusReport());
  })
);

export default router;
