import { defineConfig } from "tsup";

const shared = {
  target: "es2022",
  dts: true,
  sourcemap: true,
  treeshake: true,
} as const;

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts" },
    format: ["esm", "iife"],
    // Plain HTML artifacts read window.OpenArtifacts from the IIFE build.
    globalName: "OpenArtifacts",
    clean: true,
  },
  {
    ...shared,
    entry: { host: "src/host/index.ts" },
    format: ["esm"],
    clean: false,
  },
  {
    ...shared,
    entry: { react: "src/react/index.tsx" },
    format: ["esm"],
    external: ["react", "react/jsx-runtime"],
    clean: false,
  },
]);
