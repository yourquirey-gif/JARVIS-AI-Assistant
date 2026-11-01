import os
import re
import time
from collections import defaultdict, deque
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="JARVIS Cloud AI API", version="0.1.0")
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
    r"\b(open|launch|start|close|quit)\b.{0,50}\b(chrome|browser|notepad|calculator|paint|command prompt|youtube|instagram|facebook|github)\b",
    r"\b(desktop folders|folders on my desktop|battery percentage|battery status|cpu usage|ram usage|system information|pc status)\b",
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

def looks_like_local_action(message: str) -> bool:
    return any(re.search(pattern, message, re.IGNORECASE) for pattern in LOCAL_PATTERNS)

@app.get("/health")
async def health():
    return {"ok": True, "service": "JARVIS Cloud AI API", "model": GROQ_MODEL}

@app.post("/api/chat")
async def chat(data: ChatRequest, request: Request):
    rate_limit(request)
    if looks_like_local_action(data.message):
        raise HTTPException(409, "This command needs your paired local PC agent. Open Permissions and connect the agent on the computer you want to control.")
    if not GROQ_API_KEY:
        raise HTTPException(503, "Cloud AI is not configured yet. Add GROQ_API_KEY in the Render service environment.")
    system_prompt = (
        "You are JARVIS, a friendly personal AI assistant. Reply naturally and concisely. "
        "Reply in Hindi when the user speaks Hindi, otherwise use English. "
        "You are a cloud assistant and cannot access the user's computer, files, microphone, camera, or devices. "
        "Never claim to have opened apps, changed settings, accessed files, or performed an action on their PC. "
        "When asked to control the PC, explain that the paired local PC agent is required."
    )
    messages = [{"role": "system", "content": system_prompt}]
    for item in data.history[-8:]:
        role = item.get("role")
        content = item.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            messages.append({"role": role, "content": content[:2000]})
    messages.append({"role": "user", "content": data.message})
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": "Bearer " + GROQ_API_KEY},
                json={"model": GROQ_MODEL, "messages": messages, "temperature": 0.35},
            )
        response.raise_for_status()
        answer = response.json()["choices"][0]["message"].get("content") or "I am ready."
        return {"reply": answer, "status": "READY", "model": GROQ_MODEL}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, "The AI provider returned HTTP {}.".format(exc.response.status_code))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not connect to the AI provider. Please try again.")
