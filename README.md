# JARVIS AI Assistant

A voice-first personal assistant with three parts:

1. **Vercel website** — React dashboard, voice orb, speech transcript, permission center and chat.
2. **Render Cloud AI API** — general AI conversation only. It has no access to your PC.
3. **Local Python agent** — runs on your Windows PC and performs the small allowlisted desktop actions you approve.

## Important permission model
- Microphone, location, notifications and (where supported) Bluetooth are requested separately, only after you press their buttons.
- The website cannot obtain unrestricted access to your computer just because you click Allow.
- PC actions require the local agent on your PC, a pairing token, an enabled capability and confirmation for each action.
- Initial PC allowlist: opening approved websites, launching selected Windows apps, reading basic system/battery information, and listing Desktop folder names.
- Arbitrary shell execution, password access, silent recording, bulk file access and destructive actions are intentionally excluded.
- Browser tab control needs a separately installed browser extension; a normal website cannot freely close arbitrary tabs.
- Keep Render's GROQ_API_KEY in Render environment variables. Never put it in Vercel frontend variables or GitHub.

## Deployment
### Render Cloud API
- Runtime: Python
- Build command: `pip install -r cloud-api/requirements.txt`
- Start command: `cd cloud-api && uvicorn main:app --host 0.0.0.0 --port $PORT`
- Env: `GROQ_API_KEY` (set privately), `GROQ_MODEL=openai/gpt-oss-120b`

### Vercel frontend
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_JARVIS_CLOUD_API_URL=https://YOUR-RENDER-SERVICE.onrender.com`

### Local PC agent (not Render)
For Windows 7 use Python 3.8.10 64-bit only as a legacy bridge. Windows 7 and Python 3.8 are no longer supported for security updates. Upgrade to a supported Windows version when possible.
1. Open `backend/` and run `install.bat`.
2. Edit `backend/.env`: create a long random `JARVIS_TOKEN`, set `ALLOWED_ORIGINS` to your exact Vercel HTTPS URL, and review `ENABLE_AUTOMATION`.
3. Run `start.bat` and keep the terminal open.
4. On the website, open Permissions, enter the pairing token and connect the local agent.

Never expose the local agent port publicly or bind it to 0.0.0.0.

## Current status
This is an initial foundation and still needs integration tests, a robust pairing flow, advanced bilingual speech recognition/TTS, browser extension for tab management, and more local action handlers. Do not treat it as production-ready until these are implemented and tested.
