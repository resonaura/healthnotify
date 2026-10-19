import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/app.ts",
        "src/bot/bot.ts",
        "src/persistence/migrations/**",
      ],
      thresholds: {
        "src/domain/**": {
          branches: 90,
          lines: 90,
        },
        "src/scheduler/**": {
          branches: 90,
          lines: 90,
        },
        lines: 75,
        functions: 70,
        branches: 55,
        statements: 75,
      },
    },
  },
});
