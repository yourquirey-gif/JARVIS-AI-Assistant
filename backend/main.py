from __future__ import print_function
import os
import secrets
import re
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from agent import get_system_info, launch_app, list_desktop_folders, open_website

load_dotenv()
app = FastAPI(title="JARVIS Local Agent", version="0.1.0")
ORIGINS = [x.strip() for x in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type", "X-Jarvis-Token"])
TOKEN = os.getenv("JARVIS_TOKEN", "")
AUTOMATION = os.getenv("ENABLE_AUTOMATION", "false").lower() == "true"

class PairRequest(BaseModel):
    token: str = Field(min_length=12, max_length=200)

class Command(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    language: str = Field(default="en-IN", max_length=20)

class ActionRequest(BaseModel):
    action: str
    args: dict = {}

def auth(request, token):
    origin = request.headers.get("origin")
    if origin and origin not in ORIGINS:
        raise HTTPException(403, "This website origin is not approved by the local agent.")
    if not TOKEN:
        raise HTTPException(503, "Set JARVIS_TOKEN in backend/.env first.")
    if not token or not secrets.compare_digest(token, TOKEN):
        raise HTTPException(401, "Local agent pairing token is invalid.")

@app.get("/api/health")
async def health():
    return {"ok": True, "service": "JARVIS Local Agent"}

@app.post("/api/pair")
async def pair(data: PairRequest, request: Request):
    auth(request, data.token)
    return {"paired": True, "message": "Local agent paired for this session."}

def detect_action(text):
    value = text.lower().strip()
    patterns = [
        (r"\b(open|start|visit)\s+(youtube|google|github|instagram|facebook)\b", "open_website"),
        (r"\b(launch|open|start)\s+(notepad|calculator|paint|command prompt)\b", "launch_app"),
        (r"\b(list|show)\s+(my\s+)?desktop folders\b", "list_desktop_folders"),
        (r"\b(show|get|check)\s+(my\s+)?(pc|system|computer)\s+(status|info|information)\b|\b(show|get|check)\s+battery\s+(status|level)\b", "get_system_info"),
    ]
    for pattern, name in patterns:
        if re.search(pattern, value):
            if name == "open_website":
                target = re.search(r"youtube|google|github|instagram|facebook", value).group(0)
                return {"name": name, "args": {"name": target}, "description": "Open {} in your default browser".format(target)}
            if name == "launch_app":
                target = re.search(r"notepad|calculator|paint|command prompt", value).group(0)
                return {"name": name, "args": {"name": target}, "description": "Launch {}".format(target)}
            if name == "list_desktop_folders":
                return {"name": name, "args": {}, "description": "Read folder names from your Desktop"}
            return {"name": name, "args": {}, "description": "Read basic PC status and battery information"}
    return None

@app.post("/api/command")
async def command(data: Command, request: Request, x_jarvis_token: str = Header(default=None)):
    auth(request, x_jarvis_token)
    action = detect_action(data.message)
    if action:
        return {"proposed_action": action, "reply": "I need your permission before I do that."}
    return {"needs_ai": True, "proposed_action": None}

@app.post("/api/action/execute")
async def execute(data: ActionRequest, request: Request, x_jarvis_token: str = Header(default=None)):
    auth(request, x_jarvis_token)
    if not AUTOMATION:
        raise HTTPException(403, "Local automation is disabled. Review the allowlist, set ENABLE_AUTOMATION=true, then restart the agent.")
    try:
        if data.action == "open_website":
            reply = open_website(data.args.get("name", ""))
        elif data.action == "launch_app":
            reply = launch_app(data.args.get("name", ""))
        elif data.action == "list_desktop_folders":
            result = list_desktop_folders()
            reply = "Desktop contains {} folders: {}".format(result["count"], ", ".join(result["folders"]) or "none")
        elif data.action == "get_system_info":
            result = get_system_info()
            battery = result.get("battery")
            reply = "{}. CPU load {}%, memory use {}%, battery {}.".format(
                result["platform"], result["cpu_percent"], result["memory_percent"],
                ("{}%".format(battery["percent"]) if battery else "not available"))
        else:
            raise ValueError("Action is not in the local allowlist.")
        return {"ok": True, "reply": reply}
    except ValueError as exc:
        raise HTTPException(400, str(exc))
