import { Router } from "express";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  createUserSchema,
  idParamSchema,
  updateUserSchema,
} from "../schemas.js";
import { runHandler } from "../utils/asyncHandler.js";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from "../services/userService.js";
import type { CreateUserInput, UpdateUserInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  await runHandler(async () => {
    res.json(await listUsers());
  }, res, next);
});

router.get("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    res.json(await getUser(req.params.id));
  }, res, next);
});

router.post("/", validateBody(createUserSchema), async (req, res, next) => {
  await runHandler(async () => {
    const user = await createUser(req.body as CreateUserInput);
    res.status(201).json(user);
  }, res, next);
});

router.put(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateUserSchema),
  async (req, res, next) => {
    await runHandler(async () => {
      const user = await updateUser(req.params.id, req.body as UpdateUserInput);
      res.json(user);
    }, res, next);
  }
);

router.delete("/:id", validateParams(idParamSchema), async (req, res, next) => {
  await runHandler(async () => {
    await deleteUser(req.params.id);
    res.status(204).send();
  }, res, next);
});

export default router;
