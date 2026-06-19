import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return ["Invalid asset data"];
  }

  return errors.map((error) => {
    const path = error.instancePath || "data";
    return `${path}: ${error.message ?? "invalid"}`;
  });
}

export function validateAssetData(
  schema: Record<string, unknown>,
  data: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (!valid) {
    return { valid: false, errors: formatErrors(validate.errors) };
  }

  return { valid: true };
}
