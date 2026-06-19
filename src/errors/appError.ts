export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === code
  );
}

export const isUniqueViolation = (err: unknown) => hasCode(err, "23505");
export const isForeignKeyViolation = (err: unknown) => hasCode(err, "23503");
