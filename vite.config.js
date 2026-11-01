import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Match the last Chromium generation available on Windows 7 while keeping
// the application usable on current desktop browsers.
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
  build: {
    target: ["chrome109", "edge109", "firefox115"],
    cssTarget: ["chrome109", "edge109", "firefox115"],
    sourcemap: false
  }
});
