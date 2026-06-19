import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth/jwt.js";
import { runWithAuthContext } from "../context/authContext.js";

const PUBLIC_PATHS = new Set(["/health", "/auth/login"]);

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
      { userId: payload.sub, tenantId: payload.tenant_id },
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
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  authenticate(req, res, next);
}
