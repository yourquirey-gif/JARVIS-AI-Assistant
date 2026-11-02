# ULTRON — Personal AI Assistant

ULTRON is a voice-first assistant with a Glass Wave Blob hologram, a Hindi/English AI chat interface, and separate platform capabilities for Web/PWA, Windows Desktop and Android.

## Platform-specific apps

1. **Web / PWA** — browser voice and chat, responsive interface and automatic web-update prompt. It cannot control other apps on a phone or access a computer's local applications.
2. **Android app** — a separate Capacitor APK with native speech recognition and voice output. It can open a small, declared set of apps (WhatsApp, YouTube, Chrome, Gmail, Maps, Phone, Messages, Calculator, Play Store and Settings) from direct tap controls or simple direct voice commands. It does not read other apps' screens or type into them. It checks its Android update manifest and asks the user to approve an APK installation when a new build is published.
3. **Windows desktop app** — Electron shell with a built-in Node.js local PC service. It no longer launches a separate Python/PyInstaller executable. At first launch it requests separate PC-connection and microphone consent. When PC access is allowed, the service starts inside Electron on the first available loopback port (starting at 8765) and the trusted ULTRON website pairs automatically. Clearly requested actions on ULTRON's strict allowlist run without a second approval prompt; the initial PC-access grant remains the user's consent boundary.

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

The built-in local service binds only to `127.0.0.1`, selecting the first available port from 8765 onward. The desktop process generates a random token and allowlists only the exact HTTPS origin it loads. Closing ULTRON stops the listener and clears runtime permission state. After the user grants PC connection once, explicit commands in the approved action list do not require repeated per-command approval. No Python runtime or separate PC-service executable is required.

Currently allowed PC actions include opening selected websites, launching selected built-in applications, opening standard user folders, listing desktop folders and reading CPU/RAM/disk/network/battery status plus a short process list. Arbitrary shell execution, passwords, destructive changes, silent recording, purchases and sending messages remain disabled.

## Windows compatibility

Windows 7 / 8.1 use Electron 22 / Chromium 108, a legacy end-of-life runtime with no security updates. Windows 10/11 are preferred. Exact performance depends on the installed hardware and drivers.

**Windows 7 prerequisite:** use Windows 7 SP1 with current system updates. The PyInstaller `_socket` DLL-load failure can occur on unpatched Windows 7 systems. Check whether the applicable security update KB2533623 (or KB3126587 for systems where it applies) is installed, install the applicable update, and restart Windows. Keep the Universal C Runtime and Visual C++ runtime updates current as well. These are Windows operating-system prerequisites and cannot be supplied by the ULTRON app itself.

## iPhone

The iPhone option installs the website as a Safari home-screen web app. A signed native App Store app is not published.

## Build

```bash
npm install
npm run build
```

Android: `npx cap add android`, then `npx cap sync android` and build with Gradle/Android Studio.

Windows: `npm run build`, then `npx electron-builder --win nsis --x64`. The Node PC service is included in the Electron main process.

## Environment

Vercel: `VITE_JARVIS_CLOUD_API_URL=https://jarvis-ai-assistant-9ra4.onrender.com`.

Render: `GROQ_API_KEY` (private) and `GROQ_MODEL=openai/gpt-oss-120b`.

## Voice response and Android permissions
- Tap-to-talk processes the spoken sentence directly; the Hello/Hey ULTRON wake phrase is optional.
- Android uses native speech recognition and native text-to-speech. Microphone permission is required for voice input; opening one of the declared app shortcuts does not request a broad phone-control permission.
- The current Android release can open the selected apps. It does not read third-party app screens or type into arbitrary apps. Such automation is not enabled.
- The website shows the exact latest APK version. Until the persistent signing key is configured in GitHub Actions, the published 1.0.4 APK is clean-install only; it is not advertised as an in-place update.

## Windows voice and live system monitor

- Windows desktop voice input uses microphone capture while the user has explicitly turned listening on, then sends each short audio clip to the configured ULTRON Cloud API for Groq Whisper transcription. The Groq key remains server-side. Hindi and English commands are supported through automatic language detection. A working internet connection and a configured `GROQ_API_KEY` are required; provider usage may be billable.
- Windows text-to-speech uses the best matching installed system voice, prefers a male-sounding voice where Windows provides one, uses a lower pitch and the maximum speech API volume. The actual audible loudness also depends on the Windows speaker/output volume.
- The live System Monitor refreshes every five seconds and displays CPU, RAM used/total, disk used/total, cumulative network sent/received, uptime, process count and the largest processes by memory.
- Initial PC-connection consent is separate from microphone permission. Commands still run only when they match the local/Cloud planner's approved action list; unrestricted shell commands and destructive operations are not enabled.
