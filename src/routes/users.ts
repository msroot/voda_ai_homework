import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { createUserSchema, idParamSchema, updateUserSchema } from "../schemas.js";
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
  asyncHandler(async (_req, res) => {
    res.json(await listUsers());
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
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  })
);

router.put(
  "/:id",
  validate(idParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await updateUser(req.params.id, req.body));
  })
);

router.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(async (req, res) => {
    await deleteUser(req.params.id);
    res.status(204).send();
  })
);

export default router;
