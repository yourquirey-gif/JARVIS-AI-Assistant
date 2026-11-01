import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageInfo = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Electron 22 uses Chromium 108 (the final Chromium generation for Windows 7/8.1).
export default defineConfig({
  plugins: [react()],
  define: { __ULTRON_VERSION__: JSON.stringify(packageInfo.version) },
  server: { host: "0.0.0.0", port: 5173 },
  build: {
    target: ["chrome108", "edge108", "firefox115"],
    cssTarget: ["chrome108", "edge108", "firefox115"],
    sourcemap: false
  }
});
