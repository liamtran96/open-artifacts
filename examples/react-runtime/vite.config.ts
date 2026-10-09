import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
