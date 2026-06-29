import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // Tests touch shared JSON files (data/connections.json) and the
    // in-memory activeProviders Map, so run test files one at a time
    // to avoid cross-file state bleed.
    fileParallelism: false,
  },
});
