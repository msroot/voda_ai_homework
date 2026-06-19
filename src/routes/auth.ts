import { Router } from "express";
import { signToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/password.js";
import { findUserByEmail } from "../repositories/userRepository.js";
import type { LoginInput } from "../types.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body as LoginInput;

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await findUserByEmail(email);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const validPassword = await verifyPassword(password, user.password_hash);

  if (!validPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({
    sub: user.id,
    tenant_id: user.tenant_id,
    email: user.email,
    role: user.role,
  });

  res.json({
    token,
    user: {
      id: user.id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

export default router;
