import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { getTenantOverviewReport } from "../services/reportService.js";

const router = Router();

router.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json(await getTenantOverviewReport());
  })
);

export default router;
