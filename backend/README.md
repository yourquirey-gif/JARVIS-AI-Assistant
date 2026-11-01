# JARVIS Local PC Agent

This companion runs on the user's own Windows PC. It is never deployed to Render.

1. Install Python 3.8.10 64-bit for the legacy Windows 7 machine (Python 3.8 is end-of-life; a supported Windows version is strongly recommended).
2. Run install.bat.
3. Copy/edit .env and set a long random JARVIS_TOKEN.
4. Add the exact deployed Vercel HTTPS origin to ALLOWED_ORIGINS.
5. Review the allowlisted actions, then set ENABLE_AUTOMATION=true.
6. Run start.bat. Keep its terminal open while using JARVIS.

The agent binds to 127.0.0.1 only. Never bind to 0.0.0.0 or expose the port to the public internet. The web app uses Render's cloud API for general AI chat; this local agent handles only approved PC actions and asks for confirmation before each one.
