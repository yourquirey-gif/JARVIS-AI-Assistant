# ULTRON permission, pairing and compatibility model

## Permission reset
The app's own runtime consent switches reset when the website/PWA closes. On pagehide/beforeunload, ULTRON stops speech recognition, cancels speech synthesis, clears its in-memory pairing key and resets the permission indicators.
Browsers and operating systems retain their own grants. A website cannot programmatically revoke a saved microphone, location, notifications or Bluetooth grant, and cannot guarantee the browser will show a new OS prompt every time. To revoke an actual grant, the user must use browser or operating-system site settings.

## Automatic local pairing
The Windows companion binds only to 127.0.0.1. It returns its pairing key at GET /api/auto-pair only when the Origin header exactly matches one of the HTTPS origins configured in the desktop companion. CORS is restricted to the same allowlist. The website still has to be allowed by the browser to access the local network / loopback.
When a custom domain is added, add that exact HTTPS origin to the comma-separated trusted origins field in the Windows companion. The installer path itself is same-origin and automatically follows the custom domain.

## Browser permissions
- Microphone: required for speech recognition and wake-word mode. ULTRON only listens after the user activates it.
- Location, notifications and Bluetooth: optional and requested separately.
- Installing the PWA does not grant operating-system access.

## Allowlisted actions
Open selected websites and HTTP/HTTPS URLs; launch fixed built-in applications; open standard user folders; read basic CPU/RAM/disk/network/battery statistics; list Desktop folder names.
Each PC action requires a separate in-app confirmation.

## Explicitly excluded
Arbitrary shell/PowerShell commands, credential access, silent recording, unrestricted file-system access, destructive file actions, purchases, message sending, security-setting changes, shutdown and restart.

## Legacy browser support
The avatar is Canvas 2D and does not require WebGL. Auto/Low modes reduce frame rate and effects. The build targets Chromium 109 / Edge 109 and Firefox 115-era syntax, but Windows 7 itself and these browser versions are out of security support. Actual compatibility depends on browser and GPU/audio drivers.
