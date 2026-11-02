import os
import re
import time
import json
from collections import defaultdict, deque
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="ULTRON Cloud AI API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
WINDOW_SECONDS = 600
MAX_REQUESTS = 30
request_log = defaultdict(deque)

LOCAL_PATTERNS = [
    r"\b(open|launch|start|close|quit)\b.{0,50}\b(chrome|browser|notepad|calculator|paint|command prompt|youtube|instagram|facebook|github|explorer|task manager)\b",
    r"\b(desktop folders|folders on my desktop|battery percentage|battery status|cpu usage|ram usage|system information|pc status|open downloads|open documents)\b",
    r"\b(turn on|turn off|enable|disable)\b.{0,40}\b(wi-?fi|bluetooth|airplane mode)\b",
    r"\b(close|switch|manage)\b.{0,35}\b(tab|tabs|window|windows)\b",
]

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en-IN", max_length=20)
    history: list[dict] = Field(default_factory=list, max_length=8)

def rate_limit(request: Request):
    host = request.client.host if request.client else "unknown"
    now = time.time()
    q = request_log[host]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    if len(q) >= MAX_REQUESTS:
        raise HTTPException(429, "Too many requests. Please wait a few minutes and try again.")
    q.append(now)

def clean_history(history):
    messages = []
    for item in history[-8:]:
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            messages.append({"role": role, "content": content[:2000]})
    return messages

def valid_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        return False
    parsed = urlparse(value.strip())
    return parsed.scheme in ("http", "https") and bool(parsed.hostname) and not parsed.username and not parsed.password

def validate_action(action):
    if not isinstance(action, dict):
        return None
    name = action.get("name")
    args = action.get("args") or {}
    if not isinstance(args, dict):
        return None
    sites = {"youtube", "google", "github", "instagram", "facebook", "gmail", "wikipedia", "whatsapp"}
    apps = {"notepad", "calculator", "paint", "command prompt", "file explorer", "task manager", "control panel", "wordpad"}
    folders = {"desktop", "documents", "downloads", "pictures", "music", "videos"}
    description = str(action.get("description") or "ULTRON wants to perform an action on your PC.")[:180]
    if name == "open_website" and args.get("name") in sites:
        safe_args = {"name": args["name"]}
    elif name in ("launch_app", "close_app") and isinstance(args.get("name"), str):
        app_name = args["name"].strip()
        if app_name and len(app_name) <= 80 and re.fullmatch(r"[\w .&()+-]+", app_name, flags=re.UNICODE):
            safe_args = {"name": app_name}
        else:
            return None
    elif name == "type_text" and isinstance(args.get("text"), str) and 0 < len(args["text"]) <= 1000:
        safe_args = {"text": args["text"]}
    elif name == "open_folder" and args.get("name") in folders:
        safe_args = {"name": args["name"]}
    elif name == "open_url" and valid_url(args.get("url")):
        safe_args = {"url": args["url"].strip()}
    elif name in ("get_system_info", "list_desktop_folders"):
        safe_args = {}
    else:
        return None
    return {"name": name, "args": safe_args, "description": description}

@app.get("/health")
async def health():
    return {"ok": True, "service": "ULTRON Cloud AI API", "model": GROQ_MODEL}

@app.post("/api/transcribe")
async def transcribe(request: Request, file: UploadFile = File(...), language: str = Form("auto")):
    """Transcribe a short ULTRON voice command with Groq Whisper."""
    rate_limit(request)
    if not GROQ_API_KEY:
        raise HTTPException(503, "Voice transcription is not configured. Add GROQ_API_KEY in the Render service environment.")

    filename = os.path.basename(file.filename or "ultron-command.webm")
    content_type = (file.content_type or "audio/webm").split(";", 1)[0].strip().lower()
    allowed_types = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/mpeg", "audio/mp3"}
    if content_type not in allowed_types and not filename.lower().endswith((".webm", ".ogg", ".wav", ".m4a", ".mp3", ".mp4")):
        raise HTTPException(415, "Unsupported microphone audio format.")

    audio = await file.read(15 * 1024 * 1024 + 1)
    await file.close()
    if not audio:
        raise HTTPException(400, "No microphone audio was captured. Please speak again.")
    if len(audio) > 15 * 1024 * 1024:
        raise HTTPException(413, "Voice recording is too large. Please use a shorter command.")

    language_code = (language or "auto").split("-", 1)[0].strip().lower()
    if not re.fullmatch(r"[a-z]{2}", language_code):
        language_code = ""
    form = {
        "model": "whisper-large-v3-turbo",
        "response_format": "json",
        "temperature": "0",
        "prompt": "ULTRON computer voice command. Common names: ULTRON, YouTube, Google, Chrome, Notepad, Calculator, WhatsApp, Downloads, Desktop, Documents. Preserve Hindi and English words as spoken."
    }
    if language_code:
        form["language"] = language_code
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(35.0, connect=10.0)) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": "Bearer " + GROQ_API_KEY},
                data=form,
                files={"file": (filename, audio, content_type)},
            )
        response.raise_for_status()
        transcript = str(response.json().get("text") or "").strip()
        if not transcript:
            raise HTTPException(422, "I could not hear a clear command. Please speak a little closer to the microphone.")
        return {"text": transcript[:2000], "engine": "whisper-large-v3-turbo"}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(504, "Voice transcription timed out. Check your internet connection and try again.")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, "The voice transcription provider returned HTTP {}.".format(exc.response.status_code))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not connect to the voice transcription service. Check your internet connection and try again.")

@app.post("/api/chat")
async def chat(data: ChatRequest, request: Request):
    rate_limit(request)
    if any(re.search(pattern, data.message, re.IGNORECASE) for pattern in LOCAL_PATTERNS):
        raise HTTPException(409, "This request needs your paired ULTRON PC companion. Open Permissions and connect the companion.")
    if not GROQ_API_KEY:
        raise HTTPException(503, "Cloud AI is not configured yet. Add GROQ_API_KEY in the Render service environment.")
    messages = [{
        "role": "system",
        "content": (
            "You are ULTRON, a helpful personal AI assistant. Reply naturally and concisely. "
            "Reply in Hindi when the user speaks Hindi, otherwise use English. "
            "You are a cloud assistant and cannot access the user's computer, files, microphone, camera, or devices. "
            "Never claim to have performed a PC action. For computer control, explain that the paired ULTRON PC companion is required."
        )
    }]
    messages.extend(clean_history(data.history))
    messages.append({"role": "user", "content": data.message})
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": "Bearer " + GROQ_API_KEY},
                json={"model": GROQ_MODEL, "messages": messages, "temperature": 0.35},
            )
        response.raise_for_status()
        answer = response.json()["choices"][0]["message"].get("content") or "I am ready, sir."
        return {"reply": answer, "status": "READY", "model": GROQ_MODEL}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, "The AI provider returned HTTP {}.".format(exc.response.status_code))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not connect to the AI provider. Please try again.")

@app.post("/api/plan")
async def plan(data: ChatRequest, request: Request):
    rate_limit(request)
    if not GROQ_API_KEY:
        raise HTTPException(503, "Cloud AI is not configured yet. Add GROQ_API_KEY in the Render service environment.")
    system = (
        "You are ULTRON's command planner. Understand Hindi and English. Return one JSON object only. "
        "Decide whether the user's latest request is explicitly asking to do something on their local Windows PC. "
        "For ordinary questions/conversation return {\"kind\":\"chat\",\"reply\":\"...\"}. "
        "For supported PC commands return {\"kind\":\"action\",\"action\":{\"name\":\"...\",\"args\":{},\"description\":\"short plain-language description\"}}. "
        "Allowed action names and arguments only: open_website with name in youtube/google/github/instagram/facebook/gmail/wikipedia/whatsapp; "
        "launch_app with name as the display name of any installed app; close_app with name as the running app name; "
        "open_folder with name in desktop/documents/downloads/pictures/music/videos; "
        "open_url with url as a normal http or https URL; get_system_info with empty args; "
        "list_desktop_folders with empty args; type_text with the exact text to type into the currently focused app or website. "
        "For a web search request, use open_url with a Google search URL only if the user clearly asked to search the web. "
        "Do not invent parameters. If the requested operation is unsupported, unsafe, destructive, sends/purchases anything, accesses credentials, executes shell commands, deletes/changes files or applications, uninstalls software, edits program binaries, restarts or shuts down the PC, return a chat response explaining the limitation. "
        "Never classify a normal question about how to do something as a PC action. The user has already granted PC access in ULTRON. An explicit, clearly requested action from the paired local companion may execute without a second per-command approval prompt. Only the exact allowlisted actions above are executable; never invent or expand the allowlist. Use type_text only when the user explicitly asks you to type or write the exact requested text into the active app."
    )
    messages = [{"role": "system", "content": system}]
    messages.extend(clean_history(data.history))
    messages.append({"role": "user", "content": data.message})
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": "Bearer " + GROQ_API_KEY},
                json={
                    "model": GROQ_MODEL,
                    "messages": messages,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"].get("content") or "{}"
        result = json.loads(raw)
        if result.get("kind") == "action":
            action = validate_action(result.get("action"))
            if action:
                return {"kind": "action", "proposed_action": action}
            return {"kind": "chat", "reply": "I understood the request, but that PC action is not in my approved action list yet."}
        if result.get("kind") == "chat":
            return {"kind": "chat", "reply": str(result.get("reply") or "I am ready, sir.")[:4000]}
        raise ValueError("Invalid planner output")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, "The AI planner returned HTTP {}.".format(exc.response.status_code))
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        raise HTTPException(502, "ULTRON could not safely interpret that command. Please rephrase it.")
