import Ajv2020 from "ajv/dist/2020.js";
import { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return ["Invalid asset data"];
  }

  return errors.map((error) => {
    const path = error.instancePath || "data";
    return `${path}: ${error.message ?? "invalid"}`;
  });
}

// Each tenant schema shares the same $id in storage, so we compile in an
// isolated Ajv instance per call instead of registering schemas globally.
function compileAssetValidator(schema: Record<string, unknown>) {
  const compileSchema = structuredClone(schema);
  delete compileSchema.$id;
  delete compileSchema.$schema;

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(compileSchema);
}

export function validateAssetSchema(
  schema: Record<string, unknown>
): { valid: true } | { valid: false; errors: string[] } {
  try {
    compileAssetValidator(schema);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON Schema";
    return { valid: false, errors: [message] };
  }
}

export function validateAssetData(
  schema: Record<string, unknown>,
  data: unknown
): { valid: true } | { valid: false; errors: string[] } {
  const validate = compileAssetValidator(schema);
  const valid = validate(data);

  if (!valid) {
    return { valid: false, errors: formatErrors(validate.errors) };
  }

  return { valid: true };
}
