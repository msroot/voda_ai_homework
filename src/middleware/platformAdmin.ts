import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/appError.js";

// Platform-level provisioning (creating/deleting tenants) is authenticated with
// a shared secret sent as the x-admin-key header, not a tenant JWT. This keeps
// platform operations separate from tenant-scoped access and avoids the
// chicken-and-egg of needing a tenant before the first tenant can be created.
export function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const expected = process.env.PLATFORM_ADMIN_KEY;

  if (!expected) {
    throw new AppError(500, "Platform admin key is not configured");
  }

  if (req.header("x-admin-key") !== expected) {
    throw new AppError(401, "Invalid or missing platform admin key");
  }

  next();
}
