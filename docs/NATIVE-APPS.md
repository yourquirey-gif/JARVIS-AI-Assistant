# ULTRON native apps and compatibility

## Windows desktop
- Electron 22.3.27 / Chromium 108 is used for the legacy Windows 7/8.1-compatible package. This runtime is end-of-life and receives no security updates; Windows 10/11 are preferred.
- On first launch, ULTRON asks separately for PC connection and microphone permission. Allowing PC access starts a bundled local service bound to `127.0.0.1`.
- The trusted hosted ULTRON UI detects the companion and auto-pairs using a random per-run token.
- The desktop package exposes app-version and revoke-all IPC methods to the renderer.
- Revoke All stops the local PC service and clears the app-level microphone gate. Sensitive PC actions still need an in-app approval.

## Android
- Capacitor packages a separate native Android app with native speech recognition and voice output.
- The native speech plugin requests Android microphone permission when needed.
- The Android app checks `/app-updates/android.json`; when a newer APK is available it offers a download. Android's package installer must still be approved by the user.
- The app includes tap-to-open shortcuts and direct voice commands for a small set of known apps (WhatsApp, YouTube, Chrome, Gmail, Maps, Phone, Messages, Calculator, Play Store and Settings). It does not enumerate the full installed-app list, read third-party app screens or type into other apps.
- Any future cross-app typing or screen automation would require a separate, explicitly enabled Android Accessibility service and must follow Google Play's narrow, user-directed automation rules. Autonomous agents that autonomously plan and execute arbitrary actions through Accessibility are not permitted by Google Play policy.
- The generated APK is a debug-signed sideload APK. Play Store publication/AAB requires production signing keys and store setup.

## Web / PWA
- The mobile browser/PWA is not the native Android app. It supports browser voice features where available but cannot launch and automate other installed phone apps.
- The web/PWA checks `/app-updates/web.json` on launch, on focus and every five minutes. A newer web build displays a refresh prompt.

## iPhone
- The iPhone option installs the website as a Safari home-screen web app. A signed native iOS App Store application is not published.

## Glass Wave Blob renderer
- ULTRON uses a lightweight Canvas renderer for the glass-like orb, internal fluid waves, highlights, reflections, floating bubbles and holographic glow.
- The animation responds to listening, thinking and speech-output state, including speech-boundary events.
- AUTO and LOW quality modes adjust animation detail for modest devices.

## Update publishing
- Android and Windows use separate manifests under `public/app-updates/`.
- The respective CI workflow updates its manifest only after building and publishing the matching APK or installer. This prevents the app from advertising an installer that has not finished building.
- Updates are offered in-app, not installed silently. Android requires the package installer confirmation; Windows requires the user to run the new installer.

## Permission reset
- Revoke All stops speech recognition, cancels TTS, clears the app's local consent flags and disconnects the Windows companion.
- Android, Windows and browsers do not allow an app to silently revoke all OS-managed microphone, location, notification or other protected grants. Users must change those permissions in system settings.
