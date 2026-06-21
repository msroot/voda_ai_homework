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

// Name of the constraint a unique violation tripped (e.g. to tell an id clash
// apart from a duplicate-content clash). Returns null for non-unique errors.
export function uniqueViolationConstraint(err: unknown): string | null {
  if (!isUniqueViolation(err) || typeof err !== "object" || err === null) {
    return null;
  }
  const constraint = (err as { constraint?: unknown }).constraint;
  return typeof constraint === "string" ? constraint : null;
}
