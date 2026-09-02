import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `@/*` path in tsconfig.json. Without it, any test whose
      // subject imports another feature through the alias fails to resolve,
      // which quietly pushes tests towards relative paths across feature
      // boundaries or, worse, towards not being written. Operating manual §11
      // requires unit tests for numerical answer normalisation and scoring,
      // and both will sit behind this alias.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
