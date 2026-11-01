import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Electron 22 uses Chromium 108 (the final Chromium generation for Windows 7/8.1).
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  build: {
    target: ["chrome108", "edge108", "firefox115"],
    cssTarget: ["chrome108", "edge108", "firefox115"],
    sourcemap: false
  }
});
