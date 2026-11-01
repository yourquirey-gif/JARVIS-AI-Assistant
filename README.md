# ULTRON — Personal AI Assistant

ULTRON is a voice-first AI assistant with a glass-wave hologram, a desktop command centre, native Windows and Android apps, and an iPhone installable web app.

## Device downloads
- **Windows 7 / 8.1:** legacy native desktop build using Electron 22 / Chromium 108. This runtime is end-of-life and has no security updates.
- **Windows 10 / 11:** same desktop package and UI. Current browsers/PWA are preferred for security-sensitive use.
- **Android:** separate Capacitor native APK with native speech recognition and Android microphone permissions.
- **iPhone:** installable website/PWA through Safari. A signed App Store app is not published yet.

All installers are hosted from the Vercel site origin under `/downloads/`, so custom domain deployments automatically use the same domain for download URLs.

## Platform-specific parts
1. **Web / PWA** — browser voice and chat, automatic web refresh prompt, browser-scoped permissions and no cross-app phone control.
2. **Android app** — native speech recognition and voice interface. APK updates are detected from a platform manifest; Android still asks the user to approve installation. Cross-app automation is not enabled yet.
3. **Windows desktop app** — Electron shell and bundled local PC service. On launch, it requests PC and microphone consent. If allowed, it auto-pairs to the local companion. The app checks the Windows release manifest and prompts the user to download and run an updated installer.

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
\n## App updates and permissions\n- The web app checks its web manifest on launch, every five minutes, and when the window regains focus. A web update prompts a refresh.\n- Android and Windows each have their own update manifest. Build workflows publish the platform version only after publishing the APK or installer. Updates are offered in-app; operating systems still require the user to approve the installer.\n- Permission Center provides **Revoke All ULTRON Access**. This stops active listening/TTS, clears app-level consent and disconnects the Windows companion. Apps cannot silently revoke OS-managed microphone/location/notification grants; users must revoke those in Android/Windows/browser settings.\n- Android currently supports native speech recognition and voice output. Cross-app launching, screen reading, global typing and remote phone automation are not included in this release. Any future Android automation will require an explicitly enabled Accessibility service and per-action confirmation.\n