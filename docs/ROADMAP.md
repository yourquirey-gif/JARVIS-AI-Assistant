# JARVIS roadmap

## Initial foundation
- React JARVIS dashboard and responsive animated microphone orb.
- Browser permission center: microphone, location, notifications and Bluetooth chooser (if supported).
- Pairing token for local Python companion.
- Confirmation screen before every PC action.
- Local allowlist: open selected websites/apps, read basic system status, list Desktop folder names.
- Groq text-response integration (optional; API key remains on the user's PC).

## Next milestones
- Better Hindi/English speech pipeline and a local/cloud TTS selector.
- AI function/tool calling that proposes actions but never executes before confirmation.
- Distinct recognized-speech terminal and live status terminal.
- Persistent orb colour, size, sensitivity and drag-and-drop position.
- Browser-tab management through a separately installed extension.
- Optional device status widgets; request each capability only when used.
- Automated backend/frontend tests and deployment workflow.

## Security boundaries
- No arbitrary shell execution.
- No silent microphone recording.
- No blanket file-system access, password access, file deletion or privilege escalation.
- The local agent binds to 127.0.0.1 only.
- Browser permission prompts and local-agent pairing are separate layers.
