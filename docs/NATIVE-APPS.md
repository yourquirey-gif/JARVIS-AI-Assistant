# ULTRON native apps and compatibility

## Windows desktop
- Electron 22.3.27 / Chromium 108 is used as the final Electron line that supports Windows 7/8.1.
- This legacy runtime is end-of-life and no longer receives security updates. Prefer Windows 10/11 for ongoing use.
- On start, the app asks for PC connection Allow/Deny, then microphone Allow/Deny. PC access launches an embedded local service bound only to 127.0.0.1.
- The Vercel website auto-pairs with a random per-run token after PC access is allowed.
- On app exit, Electron stops the local service and clears runtime PC/microphone consent.
- Every local PC action still requires an approval card in ULTRON.

## Android
- Capacitor wraps the same React/Three.js ULTRON experience in a separate Android application.
- The native speech-recognition plugin requests Android RECORD_AUDIO permission on first launch.
- The Android app provides AI chat and voice on the phone. Windows PC control is available only in the Windows desktop app.
- The generated APK is currently a debug-signed sideload APK. Play Store publication/AAB requires production signing keys and store setup.

## iPhone
- The iPhone option installs the website as a Safari home-screen web app. A native signed iOS App Store application is not published.

## 3D renderer
- Newer WebGL2-capable devices use Three.js and the metallic procedural humanoid.
- Canvas 2D remains available as a fallback for old GPUs, unsupported WebGL2 drivers, and explicit LOW mode.
- AUTO attempts 3D at lower render scale on modest hardware before falling back.
- Exact appearance and frame rate depend on the installed GPU, driver, browser and device.

## Permission reset
ULTRON stops speech recognition, cancels TTS and clears its in-memory pairing token on app/page close. The Windows desktop process stops its local server on exit. Android and browser OS permission grants may remain saved by the operating system; the app cannot revoke those grants itself. Users can revoke them in system settings.
