import type { NextFunction, Response } from "express";
import { AppError } from "../errors/appError.js";

export async function runHandler(
  handler: () => Promise<void>,
  res: Response,
  next: NextFunction
) {
  try {
    await handler();
  } catch (err) {
    if (err instanceof AppError) {
      const body: Record<string, unknown> = { error: err.message };
      if (err.details !== undefined) {
        body.details = err.details;
      }
      res.status(err.statusCode).json(body);
      return;
    }
    next(err);
  }
}
