import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { createTenantSchema, idParamSchema, updateTenantSchema } from "../schemas.js";
import {
  createTenant,
  deleteTenant,
  getTenant,
  listTenants,
  updateTenant,
} from "../services/tenantService.js";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await listTenants());
  })
);

router.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await getTenant(req.params.id));
  })
);

router.post(
  "/",
  validate(createTenantSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTenant(req.body));
  })
);

router.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateTenantSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateTenant(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteTenant(req.params.id);
    res.status(204).send();
  })
);

export default router;
