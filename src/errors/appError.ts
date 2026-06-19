export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("unique");
}

export function isForeignKeyViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("foreign key");
}

export function isDuplicateKeyViolation(err: unknown): boolean {
  return err instanceof Error && err.message.includes("duplicate key");
}
