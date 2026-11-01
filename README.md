# ULTRON — Personal AI Assistant

ULTRON is a voice-first assistant with a Glass Wave Blob hologram, a Hindi/English AI chat interface, and separate platform capabilities for Web/PWA, Windows Desktop and Android.

## Platform-specific apps

1. **Web / PWA** — browser voice and chat, responsive interface and automatic web-update prompt. It cannot control other apps on a phone or access a computer's local applications.
2. **Android app** — a separate Capacitor APK with native speech recognition and voice output. It can open a small, declared set of apps (WhatsApp, YouTube, Chrome, Gmail, Maps, Phone, Messages, Calculator, Play Store and Settings) from direct tap controls or simple direct voice commands. It does not read other apps' screens or type into them. It checks its Android update manifest and asks the user to approve an APK installation when a new build is published.
3. **Windows desktop app** — Electron shell with a bundled local PC service. At first launch it requests separate PC-connection and microphone consent. When PC access is allowed, the local service starts on loopback and the trusted ULTRON website pairs automatically. PC actions still require in-app approval.

## Update behavior

- Web/PWA checks `/app-updates/web.json` on launch, every five minutes and when the app regains focus. A web update displays a refresh prompt.
- Android checks `/app-updates/android.json`. The Android build workflow publishes the version to this manifest only after the APK has been built and copied to the download path.
- Windows checks `/app-updates/windows.json`. The Windows workflow publishes the version only after the installer has been built and copied to the download path.
- Native updates are not silently installed. Android requires approval in the package installer; Windows downloads the NSIS installer and the user runs it to finish the update.

## Permissions and revocation

Permission Center includes **Revoke All ULTRON Access**. It stops active speech recognition and text-to-speech, clears ULTRON's in-app consent flags and disconnects the Windows PC companion. Operating systems do not let an app silently revoke all previously granted microphone, location or notification permissions. Those OS-level grants must be changed in Android, Windows or browser settings.

## Android phone automation boundary

The current Android APK supports native speech recognition and voice output. It does not yet launch arbitrary installed apps, read arbitrary app screens or type into other apps. Those capabilities are not enabled in this release. Android's Accessibility service must be switched on by the user in system settings. Google Play also restricts autonomous agents that plan and execute actions through Accessibility; any future phone controls must be narrowly scoped, user-directed routines with clear disclosure and consent. No blanket phone-control permission is enabled.

## Windows PC access

The local service binds only to `127.0.0.1:8765`. The desktop process generates a random token and allowlists only the exact HTTPS origin it loads. Closing ULTRON terminates the local service and clears runtime permission state. Each local PC action requires an in-app approval.

Currently allowed PC actions include opening selected websites, launching selected built-in applications, opening standard user folders and reading basic CPU/RAM/disk/network/battery status. Arbitrary shell execution, passwords, destructive changes, silent recording, purchases and sending messages are not enabled.

## Windows compatibility

Windows 7 / 8.1 use Electron 22 / Chromium 108, a legacy end-of-life runtime with no security updates. Windows 10/11 are preferred. Exact performance depends on the installed hardware and drivers.

## iPhone

The iPhone option installs the website as a Safari home-screen web app. A signed native App Store app is not published.

## Build

```bash
npm install
npm run build
```

Android: `npx cap add android`, then `npx cap sync android` and build with Gradle/Android Studio.

Windows: build the backend service with PyInstaller, then `npx electron-builder --win nsis --x64`.

## Environment

Vercel: `VITE_JARVIS_CLOUD_API_URL=https://jarvis-cloud-ai-api.onrender.com`.

Render: `GROQ_API_KEY` (private) and `GROQ_MODEL=openai/gpt-oss-120b`.

## Voice response and Android permissions
- Tap-to-talk processes the spoken sentence directly; the Hello/Hey ULTRON wake phrase is optional.
- Android uses native speech recognition and native text-to-speech. Microphone permission is required for voice input; opening one of the declared app shortcuts does not request a broad phone-control permission.
- The current Android release can open the selected apps. It does not read third-party app screens or type into arbitrary apps. Such automation is not enabled.
- The website shows the exact latest APK version. Until the persistent signing key is configured in GitHub Actions, the published 1.0.4 APK is clean-install only; it is not advertised as an in-place update.
