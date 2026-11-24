/// <reference types="vitest/config" />
import { configDefaults } from "vitest/config";
import { defineConfig } from "vite";

// Vite only serves and bundles the TypeScript UI.
// The Rust side (src-tauri/) is built by the Tauri CLI.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/.claude/**"] },
  },
  // the other sessions' copies of the repo (.claude/worktrees/*) are not this one's tests:
  // `npm run check` in the main checkout ran them all (26 197 tests, stale ones failing)
  test: { exclude: [...configDefaults.exclude, "**/.claude/**"] },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Safari 15 = the WebKit of macOS 12; also fine for WebView2 and WebKitGTK.
    target: ["es2021", "safari15", "chrome105"],
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
});
