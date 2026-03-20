import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "server/**/*.test.ts",
    ],
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
