# JARVIS permission model

## Browser permissions (requested separately)
- Microphone: only for voice recognition and orb audio-level animation.
- Location: only when the user invokes a location feature.
- Notifications: optional alerts.
- Bluetooth: optional device chooser where Web Bluetooth is supported. A permission grant does not mean every Bluetooth device or system setting is controllable.

## Local PC permissions
The website connects to a small Python companion on 127.0.0.1. The user must start it and pair it with a private token. The local companion:
- Accepts requests only from configured website origins.
- Requires the pairing token on protected endpoints.
- Is bound to loopback only.
- Executes only a small explicit allowlist.
- Shows a confirmation card in the web UI for each action before execution.

Initial allowlisted actions:
- Open approved websites in the default browser.
- Launch Notepad, Calculator or Paint on Windows.
- Read basic CPU, memory and battery status.
- List folder names (not file contents) on the Desktop.

Not yet implemented:
- Closing browser tabs (requires a dedicated extension or a native browser integration).
- Changing Wi-Fi/Bluetooth settings.
- Reading arbitrary files or the full filesystem.
- Full desktop mouse/keyboard automation.
- Telegram remote control.

## Browser compatibility notes
A deployed site must use HTTPS for microphone, location and local-network access features. Modern Chromium browsers may show a separate Local Network / Loopback permission prompt when the public website connects to localhost. Older browsers may not show that prompt, so the local pairing token and exact allowed-origin check remain important. Browser support differs by feature and version.

## Important
A browser's Allow button only grants the specific browser capability shown in its prompt. It does not grant administrator rights or unrestricted OS access. Windows UAC, app-specific access, and any local-agent action policy remain separate.
