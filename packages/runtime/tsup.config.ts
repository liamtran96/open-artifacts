import { defineConfig } from "tsup";

const shared = {
  target: "es2022",
  sourcemap: true,
  treeshake: true,
} as const;

export default defineConfig([
  {
    ...shared,
    // One ESM build with code splitting so the three entries share a single copy of the
    // client and protocol (and a single ArtifactRuntimeError class).
    entry: { index: "src/index.ts", host: "src/host.ts", react: "src/react.tsx" },
    format: ["esm"],
    splitting: true,
    external: ["react", "react/jsx-runtime"],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    // Plain HTML artifacts read window.OpenArtifacts from the IIFE build.
    entry: { index: "src/index.ts" },
    format: ["iife"],
    globalName: "OpenArtifacts",
    dts: false,
    clean: false,
  },
]);
