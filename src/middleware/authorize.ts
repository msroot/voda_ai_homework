import type { NextFunction, Request, Response } from "express";
import { getRole } from "../context/authContext.js";
import { AppError } from "../errors/appError.js";
import type { UserRole } from "../types.js";

// Role-based guard. Runs after authenticate(), so the role is available from
// the request's auth context.
export function requireRole(...allowed: UserRole[]) {
  return (_req: Request, _res: Response, next: NextFunction) => {
    if (!allowed.includes(getRole())) {
      throw new AppError(403, "You do not have permission to perform this action");
    }

    next();
  };
}

// Write access: admins and editors can mutate; viewers are read-only.
export const requireWrite = requireRole("admin", "editor");

// User management is admin-only.
export const requireAdmin = requireRole("admin");
