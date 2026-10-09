import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "adapter-html",
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
