import { Router } from "express";
import { randomUUID } from "crypto";
import { hashPassword } from "../auth/password.js";
import {
  createUser,
  deleteUser,
  findAllUsers,
  findUserById,
  findUsersByTenantId,
  updateUser,
} from "../repositories/userRepository.js";
import type { CreateUserInput, UpdateUserInput, UserRole } from "../types.js";

const router = Router();
const validRoles: UserRole[] = ["admin", "editor", "viewer"];

router.get("/", async (req, res) => {
  const { tenant_id } = req.query;

  if (tenant_id) {
    const users = await findUsersByTenantId(String(tenant_id));
    res.json(users);
    return;
  }

  const users = await findAllUsers();
  res.json(users);
});

router.get("/:id", async (req, res) => {
  const user = await findUserById(req.params.id);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.post("/", async (req, res) => {
  const { tenant_id, name, email, password, role } = req.body as CreateUserInput;

  if (!tenant_id || !name || !email || !password || !role) {
    res.status(400).json({
      error: "tenant_id, name, email, password, and role are required",
    });
    return;
  }

  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "role must be admin, editor, or viewer" });
    return;
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await createUser(
      randomUUID(),
      tenant_id,
      name,
      email,
      passwordHash,
      role
    );
    res.status(201).json(user);
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
  const { name, email, password, role } = req.body as UpdateUserInput;

  if (
    name === undefined &&
    email === undefined &&
    password === undefined &&
    role === undefined
  ) {
    res.status(400).json({
      error: "at least one of name, email, password, or role is required",
    });
    return;
  }

  if (role !== undefined && !validRoles.includes(role)) {
    res.status(400).json({ error: "role must be admin, editor, or viewer" });
    return;
  }

  try {
    const passwordHash =
      password !== undefined ? await hashPassword(password) : null;

    const user = await updateUser(
      req.params.id,
      name ?? null,
      email ?? null,
      passwordHash,
      role ?? null
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      res.status(409).json({ error: "email already exists for this tenant" });
      return;
    }
    throw err;
  }
});

router.delete("/:id", async (req, res) => {
  const deleted = await deleteUser(req.params.id);

  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(204).send();
});

export default router;
