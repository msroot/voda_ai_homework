import { Router } from "express";
import pool from "../db.js";
import { signToken } from "../auth/jwt.js";
import type { LoginInput } from "../types.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { email } = req.body as LoginInput;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const { rows } = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    email: string;
    role: "admin" | "editor" | "viewer";
  }>("SELECT id, tenant_id, name, email, role FROM users WHERE email = $1", [email]);

  if (rows.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = rows[0];
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
