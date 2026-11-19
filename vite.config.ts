import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/spinier/",
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
