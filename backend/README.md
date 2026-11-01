# ULTRON PC Companion

The Windows desktop companion runs on the user's own PC. Never deploy backend/main.py to Render.

## Recommended setup
1. Download ULTRON-Desktop.exe from the latest ULTRON desktop release.
2. Run it. On first launch it creates a private pairing key and opens the setup window.
3. Enter the deployed ULTRON HTTPS website address (the default is prefilled).
4. Tick "Enable approved PC actions" and select Save Settings & Start Companion.
5. Press Copy key. On the website, open Permissions → Local PC → paste the key → Connect.
6. Keep ULTRON PC Companion running while using local PC controls.

The companion listens only on 127.0.0.1:8765. It never binds to the public network. The website asks for confirmation for each allowlisted action.

## Windows 7 legacy note
This build targets Python 3.8 / PyInstaller 5 for legacy Windows compatibility. Windows 7 and Python 3.8 are out of security support. This is a compatibility path, not a security guarantee. Prefer a supported Windows version.

## Source setup
Use Python 3.8.10 64-bit, then run install.bat. The desktop UI can be started with python ultron_desktop.py from this folder. The packaged executable does not require a separate Python install.

## Current safety limits
Allowed: open selected websites/URLs, launch the named Windows apps, open standard user folders, read basic CPU/RAM/battery data, list Desktop folder names.
Not allowed: arbitrary PowerShell/CMD commands, silently recording audio, reading passwords, unrestricted filesystem scanning, deleting or modifying files, sending messages, purchases, or shutdown/restart.
