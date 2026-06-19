import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../auth/jwt.js";
import { runWithAuthContext } from "../context/authContext.js";

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
      {
        userId: payload.sub,
        tenantId: payload.tenant_id,
        email: payload.email,
        role: payload.role,
      },
      () => next()
    );
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
