import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { loginSchema } from "../schemas.js";
import { login } from "../services/authService.js";

const router = Router();

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    res.json(await login(req.body));
  })
);

export default router;
