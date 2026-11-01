# ULTRON — Personal AI Assistant

ULTRON is a voice-first AI assistant with a holographic metallic robot, a desktop command centre, native Windows and Android apps, and an iPhone installable web app.

## Device downloads
- **Windows 7 / 8.1:** legacy native desktop build using Electron 22 / Chromium 108. This runtime is end-of-life and has no security updates.
- **Windows 10 / 11:** same desktop package and UI. Current browsers/PWA are preferred for security-sensitive use.
- **Android:** separate Capacitor native APK with native speech recognition and Android microphone permissions.
- **iPhone:** installable website/PWA through Safari. A signed App Store app is not published yet.

All installers are hosted from the Vercel site origin under `/downloads/`, so custom domain deployments automatically use the same domain for download URLs.

## Three parts
1. **Vercel web app / PWA** — same React assistant interface, CodePen-inspired voice dock, download selector, mobile responsive layout and Three.js hologram with Canvas fallback.
2. **Render Cloud AI API** — general conversation and Hindi/English command planning through Groq; it cannot access a user's PC.
3. **Windows desktop application** — Electron shell with bundled Python/FastAPI local service. On launch it asks Allow/Deny for PC access and microphone. If PC access is allowed, it starts a random-token localhost service and the website auto-pairs.

## Windows PC access
The local service binds only to `127.0.0.1:8765`. The desktop process generates a random token and allowlists only the exact HTTPS origin it loads. On closing ULTRON, Electron terminates the local service and clears runtime permission state. Each PC action remains subject to an in-app approval card.

Allowed actions: open selected websites, launch selected built-in applications, open standard user folders, and read basic CPU/RAM/disk/network/battery status. Arbitrary shell execution, passwords, destructive changes, silent recording, purchases and sending messages are not enabled.

## 3D and legacy fallback
Newer WebGL2-capable devices render a custom procedural metallic Three.js humanoid with moving jaw, arms, hands and fingers. If WebGL2 is unavailable or LOW mode is selected, the Canvas 2D ULTRON avatar remains visible. AUTO tries WebGL2 with reduced resolution on modest hardware before falling back.

Windows 7 and 8.1 compatibility uses Electron 22, the final Electron major version that supports those OS versions. That runtime is end-of-life; Windows 7/8.1 are unsupported. Actual performance and 3D rendering depend on the GPU driver and available memory.

## Build
```bash
npm install
npm run build
```

Android: `npx cap add android`, then `npx cap sync android` and build APK in Android Studio/Gradle.
Windows: build the backend service with PyInstaller, then `npx electron-builder --win nsis --x64`.

## Environment
Vercel: `VITE_JARVIS_CLOUD_API_URL=https://jarvis-cloud-ai-api.onrender.com`.
Render: `GROQ_API_KEY` (private) and `GROQ_MODEL=openai/gpt-oss-120b`.
