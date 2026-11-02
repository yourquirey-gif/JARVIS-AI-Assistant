# JARVIS Cloud AI API

This service provides general cloud chat only. It must never perform local PC automation.

## Render settings
- Runtime: Python
- Build command: pip install -r cloud-api/requirements.txt
- Start command: cd cloud-api && uvicorn main:app --host 0.0.0.0 --port $PORT
- Environment variables:
  - GROQ_API_KEY: set privately in the Render dashboard
  - GROQ_MODEL: openai/gpt-oss-120b

The API has a basic per-IP in-memory rate limit and blocks common desktop-control commands. It is not a complete abuse-prevention system. Add stronger protections/monitoring before public high-traffic use.

The local PC companion remains in backend/ and must run on the user's own PC. Never deploy backend/agent.py as the cloud service.


## Windows desktop voice transcription

The Windows Electron app records a short microphone utterance locally and posts it to `/api/transcribe`. The Render API uses the existing `GROQ_API_KEY` to transcribe Hindi or English with `whisper-large-v3-turbo`; the key stays on the server. Microphone recordings are sent to Groq for transcription and usage may be billable by the provider.
