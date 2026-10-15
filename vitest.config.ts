import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["packages/*/test/**/*.test.{ts,tsx}", "test/**/*.test.ts"], maxWorkers: 2 } });
