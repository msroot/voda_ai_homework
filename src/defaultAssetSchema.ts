import { readFileSync } from "fs";
import { join } from "path";

const schemaPath = join(process.cwd(), "seed/schemas/default-asset.schema.json");

export default JSON.parse(readFileSync(schemaPath, "utf-8"));
