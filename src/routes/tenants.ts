import { Router } from "express";
import { validateBody, validateParams, validateUpdateTenantBody } from "../middleware/validate.js";
import { createTenantSchema, idParamSchema } from "../schemas.js";
import { runHandler } from "../utils/asyncHandler.js";
import {
  createTenant,
  deleteTenant,
  getTenant,
  listTenants,
  updateTenant,
} from "../services/tenantService.js";
import type { CreateTenantInput, UpdateTenantInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  await runHandler(async () => {
    res.json(await listTenants());
  }, res, next);
});

router.get("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    res.json(await getTenant(req.params.id));
  }, res, next);
});

router.post("/", validateBody(createTenantSchema), async (req, res, next) => {
  await runHandler(async () => {
    const tenant = await createTenant(req.body as CreateTenantInput);
    res.status(201).json(tenant);
  }, res, next);
});

router.put(
  "/:id",
  validateParams(idParamSchema),
  validateUpdateTenantBody,
  async (req, res, next) => {
    await runHandler(async () => {
      const tenant = await updateTenant(req.params.id, req.body as UpdateTenantInput);
      res.json(tenant);
    }, res, next);
  }
);

router.delete("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    await deleteTenant(req.params.id);
    res.status(204).send();
  }, res, next);
});

export default router;
