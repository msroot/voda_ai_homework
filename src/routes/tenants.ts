import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { requirePlatformAdmin } from "../middleware/platformAdmin.js";
import { requireAdmin } from "../middleware/authorize.js";
import { createTenantSchema, updateTenantSchema } from "../schemas.js";
import {
  createTenant,
  getCurrentTenant,
  updateCurrentTenant,
} from "../services/tenantService.js";

const router = Router();

// Platform-level provisioning: authenticated by x-admin-key, no tenant context.
router.post(
  "/",
  requirePlatformAdmin,
  validateRequest(createTenantSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTenant(req.body));
  })
);

// Tenant self-management: scoped to the caller's own tenant.
router.get(
  "/current",
  asyncHandler(async (_req, res) => {
    res.json(await getCurrentTenant());
  })
);

router.put(
  "/current",
  requireAdmin,
  validateRequest(updateTenantSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateCurrentTenant(req.body));
  })
);

export default router;
