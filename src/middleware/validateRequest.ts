import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/** Validates HTTP request input (body, query, or params) against a Zod schema from schemas.ts. */
export function validateRequest<T>(
  schema: ZodType<T>,
  source: "body" | "params" | "query" = "body"
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const target = req as { body: unknown; params: unknown; query: unknown };
    const result = schema.safeParse(target[source]);

    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten(),
      });
      return;
    }

    target[source] = result.data;
    next();
  };
}
