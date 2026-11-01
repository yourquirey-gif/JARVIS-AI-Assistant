# ULTRON AI Assistant

ULTRON is a lightweight, voice-first personal assistant with an animated metallic hologram.

## Three-part architecture
1. **Vercel web app / PWA** — ULTRON hologram, AI conversation, voice interface, permissions, telemetry panels and approval cards.
2. **Render Cloud AI API** — general conversation and Hindi/English command planning through Groq. It cannot access the PC.
3. **ULTRON PC Companion** — Windows desktop app that starts a loopback-only local service on the user's own PC.

## Compatibility strategy
- The avatar uses Canvas 2D, not WebGL. This avoids requiring a modern GPU or a 3D shader engine.
- Automatic quality mode chooses a lower animation rate and fewer effects on low-memory / low-core devices; select LOW or HIGH manually.
- The frontend build target includes Chromium 109 and Firefox 115 ESR-era syntax, corresponding to the final browser generations that can be installed on older Windows 7 PCs.
- Windows 7 itself is out of security support. Browser and driver support varies by machine; microphone speech recognition and local-network access are browser-dependent. No website can make an unsupported browser or GPU driver fully compatible.
- Modern Windows versions use the same frontend and can select HIGH rendering quality.

## Install and run
1. Open the Vercel website and install ULTRON as an app when your browser supports PWA installation.
2. Download ULTRON-Desktop.exe from the GitHub release linked in the website.
3. Run the desktop companion. Confirm the ULTRON HTTPS website address.
4. Enable approved PC actions, start the companion and copy the private pairing key.
5. In ULTRON, open Permissions and pair the local companion using that key.
6. Grant microphone permission and start wake-word mode. The browser tab / installed PWA must remain open and listening.

## Avatar and voice
The metallic ULTRON-inspired hologram is drawn with Canvas 2D. The jaw animates while speech synthesis is active; shoulders, arms and fingers perform small speaking gestures. This is a lightweight original procedural animation, not a movie asset or a photorealistic rigged 3D film model. Speech voice and exact voice quality depend on the browser and installed system voices.

Wake-word listening uses the browser's speech-recognition service. It runs only while ULTRON is open, microphone permission is granted, and the user has explicitly started listening. It is not an OS-level always-on background listener.

## PC controls and safety
Supported controls include opening selected websites or safe HTTP/HTTPS URLs, launching selected built-in apps, opening standard user folders, reading CPU/RAM/disk/network/battery information and listing Desktop folder names. Many Hindi and English phrasings are mapped through the cloud command planner when GROQ_API_KEY is configured.

Every PC action must be reviewed and approved in the ULTRON UI before execution. Arbitrary shell commands, password access, silent recording, unrestricted file access, deletion/modification of files, purchases, sending messages, shutdown and restart are not available.

The PC companion uses a private random pairing key, exact allowed website origin, and binds only to 127.0.0.1. Never expose port 8765 to the public internet. Browser support for local-network/loopback access varies.

## Render
Runtime: Python 3.12
Build: pip install -r cloud-api/requirements.txt
Start: cd cloud-api && uvicorn main:app --host 0.0.0.0 --port $PORT
Environment: GROQ_API_KEY (private), GROQ_MODEL=openai/gpt-oss-120b

## Vercel
Framework Vite, build npm run build, output dist.
VITE_JARVIS_CLOUD_API_URL=https://jarvis-cloud-ai-api.onrender.com
