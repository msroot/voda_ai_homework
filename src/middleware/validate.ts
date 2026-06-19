import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import {
  updateTenantFieldsSchema,
  type UpdateTenantInput,
} from "../schemas.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateParams<T extends ZodType<Record<string, string>>>(
  schema: T
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
      return;
    }

    req.params = result.data;
    next();
  };
}

export function validateUpdateTenantBody(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const raw = req.body;

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    res.status(400).json({ error: "Validation failed" });
    return;
  }

  const body = raw as Record<string, unknown>;
  const { asset_schema: assetSchema, ...rest } = body;
  const result = updateTenantFieldsSchema.safeParse(rest);

  if (!result.success) {
    res.status(400).json({
      error: "Validation failed",
      details: result.error.flatten(),
    });
    return;
  }

  if (
    result.data.name === undefined &&
    result.data.slug === undefined &&
    assetSchema === undefined
  ) {
    res.status(400).json({
      error: "at least one of name, slug, or asset_schema is required",
    });
    return;
  }

  const input: UpdateTenantInput = { ...result.data };

  if (assetSchema !== undefined) {
    input.asset_schema = assetSchema as Record<string, unknown>;
  }

  req.body = input;
  next();
}
