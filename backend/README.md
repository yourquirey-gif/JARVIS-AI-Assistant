# JARVIS Local Agent

This lightweight Python service runs on the user's PC. It is not deployed to Vercel/Render.

1. Use Python 3.8.10 64-bit for legacy Windows 7 compatibility (unsupported/EOL; prefer a supported OS).
2. Install: pip install -r requirements.txt.
3. Copy .env.example to .env; set a long random JARVIS_TOKEN.
4. Add the exact HTTPS site origin to ALLOWED_ORIGINS.
5. Add GROQ_API_KEY if you want cloud AI text responses.
6. Set ENABLE_AUTOMATION=true only after reviewing the allowlisted actions.
7. Run: python -m uvicorn main:app --host 127.0.0.1 --port 8765.

Never bind to 0.0.0.0 or expose this local agent to the public internet. Each action also requires a visible confirmation in the website.
