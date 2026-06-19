import { Router } from "express";
import { randomUUID } from "crypto";
import pool from "../db.js";
import type { CreateTenantInput, UpdateTenantInput } from "../types.js";

const router = Router();

router.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, slug, created_at FROM tenants ORDER BY created_at"
  );
  res.json(rows);
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, slug, created_at FROM tenants WHERE id = $1",
    [req.params.id]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(rows[0]);
});

router.post("/", async (req, res) => {
  const { name, slug } = req.body as CreateTenantInput;

  if (!name || !slug) {
    res.status(400).json({ error: "name and slug are required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) RETURNING id, name, slug, created_at",
      [randomUUID(), name, slug]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "slug already exists" });
      return;
    }
    throw err;
  }
});

router.put("/:id", async (req, res) => {
  const { name, slug } = req.body as UpdateTenantInput;

  if (name === undefined && slug === undefined) {
    res.status(400).json({ error: "at least one of name or slug is required" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `UPDATE tenants
       SET name = COALESCE($2, name),
           slug = COALESCE($3, slug)
       WHERE id = $1
       RETURNING id, name, slug, created_at`,
      [req.params.id, name ?? null, slug ?? null]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "slug already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM tenants WHERE id = $1", [
    req.params.id,
  ]);

  if (rowCount === 0) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.status(204).send();
});

export default router;
