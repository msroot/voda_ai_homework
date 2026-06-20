import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { requireAdmin } from "../middleware/authorize.js";
import { idempotency } from "../middleware/idempotency.js";
import {
  createUserSchema,
  idParamSchema,
  paginationSchema,
  updateUserSchema,
  type Pagination,
} from "../schemas.js";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from "../services/userService.js";

const router = Router();

router.get(
  "/",
  validateRequest(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await listUsers(req.query as unknown as Pagination));
  })
);

router.get(
  "/:id",
  validateRequest(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await getUser(req.params.id));
  })
);

router.post(
  "/",
  requireAdmin,
  validateRequest(createUserSchema),
  idempotency("tenant"),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  })
);

router.put(
  "/:id",
  requireAdmin,
  validateRequest(idParamSchema, "params"),
  validateRequest(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUser(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  requireAdmin,
  validateRequest(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteUser(req.params.id);
    res.status(204).send();
  })
);

export default router;
