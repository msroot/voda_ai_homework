import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db.js";
import type { CreateUserInput, UpdateUserInput, UserRole } from "../types.js";

const router = Router();
const validRoles: UserRole[] = ["admin", "editor", "viewer"];

router.get("/", async (req, res) => {
  const { tenant_id } = req.query;

  if (tenant_id) {
    const { rows } = await pool.query(
      "SELECT id, tenant_id, name, email, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at",
      [tenant_id]
    );
    res.json(rows);
    return;
  }

  const { rows } = await pool.query(
    "SELECT id, tenant_id, name, email, role, created_at FROM users ORDER BY created_at"
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, tenant_id, name, email, role, created_at FROM users WHERE id = $1",
    [req.params.id]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const { tenant_id, name, email, role } = req.body as CreateUserInput;

  if (!tenant_id || !name || !email || !role) {
    res.status(400).json({ error: "tenant_id, name, email, and role are required" });
    return;
  }

  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "role must be admin, editor, or viewer" });
    return;
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO users (id, tenant_id, name, email, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, tenant_id, name, email, role, created_at",
      [randomUUID(), tenant_id, name, email, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("unique")) {
        res.status(409).json({ error: "email already exists for this tenant" });
        return;
      }
      if (err.message.includes("foreign key")) {
        res.status(400).json({ error: "tenant not found" });
        return;
      }
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { name, email, role } = req.body as UpdateUserInput;

  if (name === undefined && email === undefined && role === undefined) {
    res.status(400).json({ error: "at least one of name, email, or role is required" });
    return;
  }

  if (role !== undefined && !validRoles.includes(role)) {
    res.status(400).json({ error: "role must be admin, editor, or viewer" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           role = COALESCE($4, role)
       WHERE id = $1
       RETURNING id, tenant_id, name, email, role, created_at`,
      [req.params.id, name ?? null, email ?? null, role ?? null]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "email already exists for this tenant" });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [
    req.params.id,
  ]);

  if (rowCount === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(204).send();
});

export default router;
