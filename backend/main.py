from __future__ import print_function
import os
import re
import secrets
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from agent import get_system_info, launch_app, list_desktop_folders, open_website, open_url, open_folder

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"), override=False)
app = FastAPI(title="ULTRON Local PC Companion", version="0.2.0")
DEFAULT_ORIGINS = (
    "https://jarvis-ai-assistant-zeta-six.vercel.app,"
    "https://jarvis-ai-assistant-funwithme759-6091s-projects.vercel.app,"
    "http://localhost:5173,http://127.0.0.1:5173"
)
ORIGINS = [x.strip().rstrip("/") for x in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Ultron-Token", "X-Jarvis-Token"],
)
TOKEN = os.getenv("ULTRON_TOKEN", os.getenv("JARVIS_TOKEN", ""))
AUTOMATION = os.getenv("ENABLE_AUTOMATION", "false").lower() in ("1", "true", "yes", "on")

class PairRequest(BaseModel):
    token: str = Field(min_length=12, max_length=200)

class Command(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en-IN", max_length=20)

class ActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=60)
    args: dict = Field(default_factory=dict)

def auth(request, token):
    origin = request.headers.get("origin", "").rstrip("/")
    if origin and origin not in ORIGINS:
        raise HTTPException(403, "This website origin is not approved by ULTRON PC Companion. Update the website address in the desktop app.")
    if not TOKEN:
        raise HTTPException(503, "Open the ULTRON desktop app once to create a secure pairing key.")
    if not token or not secrets.compare_digest(token, TOKEN):
        raise HTTPException(401, "Pairing key is incorrect. Copy the key shown in ULTRON PC Companion.")

@app.middleware("http")
async def private_network_access(request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network", "").lower() == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

@app.get("/api/health")
async def health():
    return {
        "ok": True,
        "service": "ULTRON Local PC Companion",
        "automation_enabled": AUTOMATION,
        "paired": bool(TOKEN),
        "version": "0.2.0"
    }

@app.post("/api/pair")
async def pair(data: PairRequest, request: Request):
    auth(request, data.token)
    return {"paired": True, "automation_enabled": AUTOMATION, "message": "ULTRON local companion paired."}

def detect_action(text):
    value = re.sub(r"\s+", " ", text.lower().strip())
    sites = {
        "youtube": ["youtube", "यूट्यूब"],
        "google": ["google", "गूगल"],
        "github": ["github", "गिटहब"],
        "instagram": ["instagram", "इंस्टाग्राम"],
        "facebook": ["facebook", "फेसबुक"],
        "gmail": ["gmail", "जीमेल"],
        "wikipedia": ["wikipedia", "विकिपीडिया"],
        "whatsapp": ["whatsapp", "व्हाट्सएप"],
    }
    apps = {
        "notepad": ["notepad", "नोटपैड"],
        "calculator": ["calculator", "calc", "कैलकुलेटर"],
        "paint": ["paint", "पेंट"],
        "command prompt": ["command prompt", "cmd"],
        "file explorer": ["file explorer", "explorer", "files", "फाइल एक्सप्लोरर"],
        "task manager": ["task manager", "टास्क मैनेजर"],
        "control panel": ["control panel", "कंट्रोल पैनल"],
        "wordpad": ["wordpad", "वर्डपैड"],
    }
    open_words = ("open", "launch", "start", "visit", "खोलो", "खोल", "चालू करो", "चलाओ")
    if any(w in value for w in open_words):
        for name, aliases in sites.items():
            if any(a in value for a in aliases):
                return {"name": "open_website", "args": {"name": name}, "description": "Open {} in your browser".format(name)}
        for name, aliases in apps.items():
            if any(a in value for a in aliases):
                return {"name": "launch_app", "args": {"name": name}, "description": "Launch {}".format(name)}
        for name in ("desktop", "documents", "downloads", "pictures", "music", "videos"):
            hindi_folders = {"desktop": "डेस्कटॉप", "documents": "दस्तावेज", "downloads": "डाउनलोड"}
            if name in value or (name == "downloads" and "download" in value) or (name in hindi_folders and hindi_folders[name] in value):
                return {"name": "open_folder", "args": {"name": name}, "description": "Open your {} folder".format(name)}
    if any(x in value for x in ("battery", "बैटरी", "system info", "pc status", "computer status", "system status", "system information", "cpu usage", "ram usage", "पीसी की जानकारी", "कंप्यूटर की जानकारी")):
        return {"name": "get_system_info", "args": {}, "description": "Read basic PC and battery status"}
    if ("desktop folders" in value or "डेस्कटॉप के फोल्डर" in value or "show folders" in value or "फोल्डर दिखाओ" in value):
        return {"name": "list_desktop_folders", "args": {}, "description": "List folder names on your Desktop"}
    return None

@app.post("/api/command")
async def command(data: Command, request: Request, x_ultron_token: str = Header(default=None), x_jarvis_token: str = Header(default=None)):
    auth(request, x_ultron_token or x_jarvis_token)
    action = detect_action(data.message)
    if action:
        return {"proposed_action": action, "needs_ai": False}
    return {"needs_ai": True, "proposed_action": None}

@app.post("/api/action/execute")
async def execute(data: ActionRequest, request: Request, x_ultron_token: str = Header(default=None), x_jarvis_token: str = Header(default=None)):
    auth(request, x_ultron_token or x_jarvis_token)
    if not AUTOMATION:
        raise HTTPException(403, "PC actions are disabled. Open ULTRON PC Companion, tick Enable PC actions, then restart the companion.")
    try:
        if data.action == "open_website":
            reply = open_website(data.args.get("name", ""))
        elif data.action == "open_url":
            reply = open_url(data.args.get("url", ""))
        elif data.action == "launch_app":
            reply = launch_app(data.args.get("name", ""))
        elif data.action == "open_folder":
            reply = open_folder(data.args.get("name", ""))
        elif data.action == "list_desktop_folders":
            result = list_desktop_folders()
            reply = "Desktop has {} folders: {}".format(result["count"], ", ".join(result["folders"]) or "none")
        elif data.action == "get_system_info":
            result = get_system_info()
            battery = result.get("battery")
            reply = "{}. CPU {}%, RAM {}% of {} GB, battery {}.".format(
                result["platform"], result["cpu_percent"], result["memory_percent"],
                result["memory_total_gb"],
                ("{}%".format(battery["percent"]) if battery else "not available"))
        else:
            raise ValueError("This action is not in ULTRON's approved local action list.")
        return {"ok": True, "reply": reply}
    except (ValueError, OSError) as exc:
        raise HTTPException(400, str(exc))
