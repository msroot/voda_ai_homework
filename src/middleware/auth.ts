import type { NextFunction, Request, Response } from "express";
import { verifyToken, runWithAuthContext } from "../auth.js";

// Requests that must NOT go through tenant JWT auth. This covers truly public
// routes plus platform provisioning routes, which are authenticated separately
// by the x-admin-key header (see requirePlatformAdmin).
function isJwtExempt(req: Request): boolean {
  if (req.path === "/health") {
    return true;
  }

  if (req.method === "POST" && req.path === "/auth/login") {
    return true;
  }

  // Platform-level tenant provisioning (authenticated by x-admin-key).
  if (req.method === "POST" && req.path === "/tenants") {
    return true;
  }

  return false;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyToken(token);

    runWithAuthContext(
      { userId: payload.sub, tenantId: payload.tenant_id, role: payload.role },
      () => next()
    );
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAuthUnlessPublic(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (isJwtExempt(req)) {
    next();
    return;
  }

  authenticate(req, res, next);
}
