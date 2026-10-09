import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";

/**
 * Serve the runtime's IIFE bundle at /runtime.global.js so artifact.html can
 * load it with a classic script tag, the way a plain HTML artifact would in a
 * product. The host page uses the ESM entry through normal imports.
 */
function serveRuntimeIife(): Plugin {
  const iifePath = fileURLToPath(import.meta.resolve("@open-artifacts/runtime/iife"));
  const route = "/runtime.global.js";
  return {
    name: "serve-runtime-iife",
    configureServer(server) {
      server.middlewares.use(route, (_request, response) => {
        readFile(iifePath).then(
          (source) => {
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.end(source);
          },
          () => {
            response.statusCode = 500;
            response.end("runtime IIFE not built; run pnpm build first");
          },
        );
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: route.slice(1),
        source: await readFile(iifePath, "utf8"),
      });
    },
  };
}

export default defineConfig({
  plugins: [serveRuntimeIife()],
  // The artifact iframe is sandboxed without allow-same-origin, so its requests carry
  // Origin: null. Vite's default CORS policy only allows the server's own origin, which
  // would block module scripts and the HMR client inside the frame. Dev server only.
  server: { cors: { origin: "*" } },
  build: {
    rollupOptions: {
      input: { host: "index.html", artifact: "artifact.html" },
    },
  },
});
