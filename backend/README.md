# ULTRON Windows PC service

This FastAPI service is bundled into the native Windows desktop app. It runs only on `127.0.0.1:8765`.

The Electron main process asks the user for Allow/Deny before starting it. When allowed, it supplies a per-run random token, the exact HTTPS site origin, and the local automation enable flag. The website discovers `/api/health` and retrieves the token from `/api/auto-pair` only for the trusted origin.

Closing ULTRON stops the service. Never deploy this module to Render; Render hosts only `cloud-api/`.
