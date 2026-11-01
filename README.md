# ULTRON AI Assistant

ULTRON has three parts:

1. Vercel web app / installable PWA — voice interface, install experience, conversation, permissions and approval cards.
2. Render Cloud AI API — general conversation and safe command planning through Groq. It cannot access the PC.
3. ULTRON PC Companion — a Windows desktop app that starts a loopback-only local service on the user's PC.

## Install and run
1. Open the Vercel website and use Install ULTRON to install the web interface as an app when your browser supports it.
2. Download ULTRON-Desktop.exe from the GitHub release link shown in the website's PC Companion section.
3. Run the desktop companion. Enter the website HTTPS origin if it is not already filled.
4. Enable approved PC actions, start the companion and copy the pairing key.
5. In ULTRON, open Permissions and pair the local companion using the copied key.
6. Grant microphone permission, press Start wake-word mode, then say "Hello Ultron" or "Hey Ultron". The browser tab / installed PWA must remain open and listening.

## Voice
The browser speech engine is used for recognition and synthesis. ULTRON prefers an available masculine voice, lower pitch and measured rate. The exact voice depends on installed Windows voices and browser support; a deep male voice cannot be guaranteed on every computer. Wake-word detection runs while the website app is open, microphone permission is granted, and listening mode is active. It is not an always-on background microphone service.

## PC controls and safety
Supported PC actions currently include opening selected websites or safe HTTP/HTTPS URLs, launching selected built-in apps, opening standard user folders, reading basic CPU/RAM/battery information and listing Desktop folder names. ULTRON understands many Hindi and English phrasings through a cloud command planner when GROQ_API_KEY is configured.

Every PC action must be reviewed and approved in the ULTRON UI before execution. Arbitrary shell commands, password access, silent recording, unrestricted file access, deletion/modification of files, purchases, sending messages, shutdown and restart are intentionally not available. A voice assistant should not silently perform every operation without review.

The PC companion uses a private random pairing key, exact allowed website origin, and binds only to 127.0.0.1. Never expose port 8765 to the public internet. Browser support for local-network/loopback access varies; the browser may show an additional permission prompt.

## Render
Runtime: Python 3.12
Build: pip install -r cloud-api/requirements.txt
Start: cd cloud-api && uvicorn main:app --host 0.0.0.0 --port $PORT
Environment: GROQ_API_KEY (private), GROQ_MODEL=openai/gpt-oss-120b

## Vercel
Framework Vite, build npm run build, output dist.
VITE_JARVIS_CLOUD_API_URL=https://jarvis-cloud-ai-api.onrender.com

## Legacy operating systems
A legacy Windows 7-compatible desktop build is attempted using Python 3.8 and PyInstaller 5. Windows 7 and Python 3.8 are unsupported / out of security updates. A current Windows release is strongly recommended.
