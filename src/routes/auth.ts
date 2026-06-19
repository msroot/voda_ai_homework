import { Router } from "express";
import { validateBody } from "../middleware/validate.js";
import { loginSchema } from "../schemas.js";
import { runHandler } from "../utils/asyncHandler.js";
import { login } from "../services/authService.js";
import type { LoginInput } from "../types.js";

const router = Router();

router.post("/login", validateBody(loginSchema), async (req, res, next) => {
  await runHandler(async () => {
    const result = await login(req.body as LoginInput);
    res.json(result);
  }, res, next);
});

export default router;
