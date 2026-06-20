import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { requireAdmin } from "../middleware/authorize.js";
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
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await listUsers(req.query as unknown as Pagination));
  })
);

router.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await getUser(req.params.id));
  })
);

router.post(
  "/",
  requireAdmin,
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  })
);

router.put(
  "/:id",
  requireAdmin,
  validate(idParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUser(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  requireAdmin,
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteUser(req.params.id);
    res.status(204).send();
  })
);

export default router;
