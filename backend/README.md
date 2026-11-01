# ULTRON PC Companion

The Windows desktop companion runs on the user's own PC. Never deploy backend/main.py to Render.

## Setup
1. Download the Windows companion from your ULTRON website's **Windows companion** link (same-origin path: `/downloads/ULTRON-Desktop.exe`).
2. Run it. On first launch it creates a private pairing key.
3. The trusted ULTRON HTTPS website origins are prefilled. If you later add a custom domain, add that exact HTTPS origin to the comma-separated trusted origins field.
4. Tick **Enable approved PC actions** and select **Save Settings & Start Companion**.
5. Open ULTRON website on the same PC. After the browser permits local-network access, ULTRON discovers and pairs automatically. No copy/paste pairing step is needed.
6. Use **Minimize · Keep PC Companion Running** while using the website. Closing the companion window stops the local service.

The companion listens only on 127.0.0.1:8765 and never binds to the public network. It returns the pairing key only to exact trusted origins. Each PC action is still shown for approval.

## Windows 7 legacy note
This is a Python 3.8 / PyInstaller 5 compatibility build. Windows 7 and Python 3.8 are out of security support. Compatibility depends on the machine's browser, drivers and system libraries; prefer a supported Windows version.

## Source setup
Use Python 3.8.10 64-bit, run install.bat, then start.bat. A packaged executable is available for users who do not have Python installed.

## Safety limits
Allowed: open selected websites/URLs, launch a fixed list of Windows applications, open standard user folders, read basic CPU/RAM/disk/network/battery information, and list Desktop folder names.
Not allowed: arbitrary PowerShell/CMD commands, silently recording audio, reading passwords, unrestricted filesystem scanning, deleting or modifying files, sending messages, purchases, or shutdown/restart.
