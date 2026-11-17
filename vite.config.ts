import { defineConfig } from "vite";

// Vite only serves and bundles the TypeScript UI.
// The Rust side (src-tauri/) is built by the Tauri CLI.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
