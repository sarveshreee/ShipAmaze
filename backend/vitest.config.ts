import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    hookTimeout: 60_000,
    testTimeout: 60_000,
    pool: "forks",
    isolate: true,
  },
});
