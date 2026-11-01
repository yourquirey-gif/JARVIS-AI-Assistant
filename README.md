# JARVIS AI Assistant

React voice dashboard + a local Python companion that can perform explicitly approved actions on your own PC.

## How permissions work
- Microphone, location, notifications and (where supported) Bluetooth are requested separately, only after you press their buttons.
- The website cannot obtain unrestricted access to your computer just because you click Allow.
- PC actions require the local agent on your PC, a pairing token, an enabled capability and confirmation for each action.
- The initial agent only supports an allowlist: opening approved websites, launching selected Windows apps, reading basic system/battery information, and listing Desktop folder names after confirmation.
- Arbitrary shell commands, password access, silent recording, bulk file access and destructive actions are intentionally excluded.
- Browser tab control needs a separately installed browser extension; a normal website cannot freely close arbitrary tabs.

## Architecture
- src/: React UI, voice orb, speech transcript, conversation and permission center.
- backend/: local FastAPI agent. Runs on the PC, bound to 127.0.0.1 only.
- Keep AI keys and the pairing secret in the local agent's .env; never put them in Vercel frontend variables.

## Local PC setup
For Windows 7, use Python 3.8 (legacy/EOL) only as a compatibility bridge. It is not a secure, supported long-term platform.

1. Install Python 3.8.10 64-bit.
2. Open Command Prompt in backend.
3. Create and activate a virtual environment:
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
4. Copy .env.example to .env. Generate a private token:
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   Put the output in JARVIS_TOKEN. Add your exact deployed website origin to ALLOWED_ORIGINS.
5. Optional: add your Groq key to GROQ_API_KEY.
6. Start the local agent:
   python -m uvicorn main:app --host 127.0.0.1 --port 8765
7. Open the JARVIS website over HTTPS, go to Local Agent, enter the token and connect.

Do not expose port 8765 to the internet or bind the agent to 0.0.0.0.

## Frontend
   npm install
   npm run dev

## Current implementation status
This is an initial scaffold, not a finished production assistant. Voice support depends on browser APIs; local actions require manual pairing and per-action approval. More advanced speech/TTS, full tool-calling, browser extension, persistent orb layout and automated tests remain roadmap items.
