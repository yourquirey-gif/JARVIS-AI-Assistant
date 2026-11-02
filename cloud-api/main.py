import os
import re
import time
import json
from html.parser import HTMLParser
from collections import defaultdict, deque
from urllib.parse import urlparse, parse_qs, unquote

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
    r"\b(delete|remove|trash|erase)\b.{0,80}\b(file|document|pdf|image|photo)\b",
    r"(?:डिलीट|मिटा|हटा)\b.{0,80}\b(फाइल|दस्तावेज|फोटो|तस्वीर)\b",
]

class SiteSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=120)

class DuckDuckGoResultParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.results = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        values = dict(attrs)
        classes = (values.get("class") or "").split()
        if "result__a" not in classes and "result-link" not in classes:
            return
        href = unquote(values.get("href") or "")
        parsed = urlparse(href if href.startswith(("http://", "https://")) else "https:" + href if href.startswith("//") else "https://html.duckduckgo.com" + href)
        if parsed.hostname and parsed.hostname.endswith("duckduckgo.com"):
            target = parse_qs(parsed.query).get("uddg", [])
            if target:
                href = unquote(target[0])
        parsed_target = urlparse(href)
        if parsed_target.scheme not in ("http", "https") or not parsed_target.hostname:
            return
        host = (parsed_target.hostname or "").lower()
        if host.endswith("duckduckgo.com") or host == "googleadservices.com":
            return
        self.current = {"url": href, "title_parts": []}

    def handle_data(self, data):
        if self.current is not None:
            self.current["title_parts"].append(data)

    def handle_endtag(self, tag):
        if tag != "a" or self.current is None:
            return
        item = self.current
        self.current = None
        title = " ".join("".join(item["title_parts"]).split())
        if title:
            host = (urlparse(item["url"]).hostname or "").lower()
            self.results.append({"title": title[:160], "url": item["url"], "domain": host.removeprefix("www.")})

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
    elif name == "search_website" and isinstance(args.get("query"), str):
        query = args["query"].strip()
        if query and len(query) <= 120 and re.fullmatch(r"[\w .&()+@'-]+", query, flags=re.UNICODE):
            safe_args = {"query": query}
        else:
            return None
    elif name == "delete_item" and args.get("folder") in folders and isinstance(args.get("name"), str):
        filename = args["name"].strip()
        if filename and len(filename) <= 180 and filename not in (".", "..") and not re.search(r'[\\/<>:"|?*]', filename):
            safe_args = {"folder": args["folder"], "name": filename}
        else:
            return None
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

@app.post("/api/search-sites")
async def search_sites(data: SiteSearchRequest, request: Request):
    """Find web destinations so ULTRON can ask before opening ambiguous names."""
    rate_limit(request)
    query = data.query.strip()
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=True, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
        }) as client:
            response = await client.get("https://html.duckduckgo.com/html/", params={"q": query + " official website"})
            response.raise_for_status()
        parser = DuckDuckGoResultParser()
        parser.feed(response.text)
        unique = []
        seen = set()
        for item in parser.results:
            parsed = urlparse(item["url"])
            domain = (parsed.hostname or "").lower().removeprefix("www.")
            if not domain or domain in seen:
                continue
            seen.add(domain)
            unique.append({"title": item["title"], "url": item["url"], "domain": domain})
            if len(unique) >= 5:
                break
        return {"query": query, "results": unique}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, "Website search provider returned HTTP {}.".format(exc.response.status_code))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not search for that website. Try saying its full domain name.")

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
            "You are ULTRON, a courteous personal AI assistant. Always address the user as Sir. "
            "Use clear English for website choices and action confirmations. Reply in the user's language for general explanations. "
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
        "You are ULTRON, a courteous personal Windows AI assistant. Always address the user as Sir in every reply. "
        "Use clear English for action prompts and confirmations, even when the user speaks Hindi. "
        "Understand Hindi and English commands. Return one JSON object only. "
        "For ordinary questions return {\"kind\":\"chat\",\"reply\":\"Sir, ...\"}. "
        "For supported PC commands return {\"kind\":\"action\",\"action\":{\"name\":\"...\",\"args\":{},\"description\":\"...\"}}. "
        "Allowed action names: open_website with a known website name; search_website with the user's requested site or brand query; "
        "launch_app with the display name of an installed app; close_app with the running app name; "
        "open_folder with name in desktop/documents/downloads/pictures/music/videos; "
        "open_url with a complete normal http or https URL; get_system_info; list_desktop_folders; "
        "type_text with exact text to type into the currently focused app or website; "
        "delete_item with folder in desktop/documents/downloads/pictures/music/videos and one exact file name. "
        "When the user asks to open a website by name rather than a complete domain, prefer search_website. "
        "Do not invent a URL for a product, company, or brand name. The app searches and displays real numbered results; the user chooses one. "
        "For delete_item, only act on one explicitly named file in one approved user folder. Never guess the folder or file name. "
        "The app shows a separate confirmation before moving a file to the Windows Recycle Bin. "
        "Do not support bulk deletion, permanent deletion, emptying the Recycle Bin, deleting system/app files, shell commands, registry edits, credential access, purchases, messages, shutdown, or restart. "
        "Use type_text only when the user explicitly asks you to type/write the exact requested content into the active app. "
        "Never claim an action is complete before the local companion reports success."
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
