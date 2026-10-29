import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port and no screen clearing so Rust errors stay visible.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
