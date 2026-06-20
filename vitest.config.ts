import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { defineConfig } from "vitest/config";

// The source uses NodeNext-style imports with explicit ".js" extensions that
// actually point at ".ts" files. Vite doesn't remap those by default, so this
// small resolver rewrites relative ".js" specifiers to their ".ts" source.
const resolveTsFromJs = {
  name: "resolve-ts-from-js",
  enforce: "pre" as const,
  resolveId(source: string, importer?: string) {
    if (importer && source.startsWith(".") && source.endsWith(".js")) {
      const candidate = resolve(dirname(importer), source.replace(/\.js$/, ".ts"));
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  },
};

export default defineConfig({
  plugins: [resolveTsFromJs],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Tests share one database and reseed in beforeAll, so they must not run in
    // parallel across files.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 90000,
  },
});
