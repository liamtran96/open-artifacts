import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "embed",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
