# ULTRON — Personal AI Assistant

ULTRON is a voice-first assistant with a metallic hologram, an installable web app, and a Windows PC companion.

## Architecture
1. **Vercel website / PWA** — same-origin installer download, desktop and mobile UI, voice interface, command centre panels and approval cards.
2. **Render Cloud AI API** — general conversation and Hindi/English command planning through Groq. It cannot access the user's PC.
3. **ULTRON PC Companion** — Windows desktop app that runs a loopback-only service on the user's PC.

## Install
- Open the Vercel website and install ULTRON as a PWA from the browser's Install / Add to Home Screen option.
- The Windows companion is served from the same website origin at `/downloads/ULTRON-Desktop.exe`. A future custom domain automatically uses its own URL for the installer.
- Run the Windows companion, enable approved PC actions, and start the local service.
- The website automatically discovers and pairs with the companion when opened from an exact trusted origin. No manual pairing-key copy/paste is needed for trusted origins.
- Keep the Windows companion running (the Minimize button keeps it active). Closing it stops the local service.

## Permissions and app-close behaviour
ULTRON starts with its own microphone/location/notification/Bluetooth switches off. On page close, its listening loop, speech output, in-memory pairing token and displayed permission states are cleared. On next open, the user must explicitly turn listening on again.
Browsers and operating systems retain their own permission grants. A website cannot revoke a saved browser microphone/location/notification grant programmatically or force the browser to show a fresh system prompt on every launch. Users can revoke those grants in browser/site settings.

## Compatibility and mobile
- The avatar uses Canvas 2D rather than WebGL to reduce GPU requirements.
- Auto / Low / High visual quality modes adjust rendering work for the available device.
- The frontend build is transpiled for Chromium 109 / Edge 109 and Firefox 115-era engines to improve support for legacy browsers. Windows 7 and Python 3.8 are out of security support; compatibility depends on the browser, graphics driver and audio devices.
- The same PWA has a mobile-specific layout for Android and iOS browsers. Mobile installation provides ULTRON voice/chat; Windows PC actions require the companion running on the Windows computer.

## Safety
The companion binds only to `127.0.0.1`, returns its pairing key only to exact allowlisted website origins and supports only a controlled list of actions. Each action still requires in-app confirmation. Arbitrary shell execution, password access, silent recording, destructive file changes, purchases and message sending are not enabled.

## Render
Runtime: Python 3.12
Build: `pip install -r cloud-api/requirements.txt`
Start: `cd cloud-api && uvicorn main:app --host 0.0.0.0 --port $PORT`
Environment: `GROQ_API_KEY` (private), `GROQ_MODEL=openai/gpt-oss-120b`

## Vercel
Framework: Vite
Build: `npm run build`
Output: `dist`
Cloud API URL: `VITE_JARVIS_CLOUD_API_URL=https://jarvis-cloud-ai-api.onrender.com`
Windows installer: served as a Vercel static asset at `/downloads/ULTRON-Desktop.exe`.
