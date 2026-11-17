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
    // Safari 15 = the WebKit of macOS 12; also fine for WebView2 and WebKitGTK.
    target: ["es2021", "safari15", "chrome105"],
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
