"""Safe, allowlisted Windows actions for the ULTRON local companion."""
import os
import platform
import subprocess
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

import psutil

WEBSITES = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "github": "https://github.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "gmail": "https://mail.google.com",
    "wikipedia": "https://www.wikipedia.org",
    "whatsapp": "https://web.whatsapp.com",
}
WINDOWS_APPS = {
    "notepad": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "paint": ["mspaint.exe"],
    "command prompt": ["cmd.exe"],
    "file explorer": ["explorer.exe"],
    "task manager": ["taskmgr.exe"],
    "control panel": ["control.exe"],
    "wordpad": ["write.exe"],
}
FOLDER_NAMES = {
    "desktop": "Desktop",
    "documents": "Documents",
    "downloads": "Downloads",
    "pictures": "Pictures",
    "music": "Music",
    "videos": "Videos",
}

def open_website(name):
    key = str(name).strip().lower()
    if key not in WEBSITES:
        raise ValueError("Website is not in the approved list.")
    webbrowser.open_new_tab(WEBSITES[key])
    return "Opened {} in your default browser.".format(key.title())

def open_url(url):
    value = str(url).strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only valid HTTP or HTTPS website addresses can be opened.")
    if len(value) > 2048:
        raise ValueError("Website address is too long.")
    webbrowser.open_new_tab(value)
    return "Opened the requested website."

def launch_app(name):
    key = str(name).strip().lower()
    command = WINDOWS_APPS.get(key) if platform.system() == "Windows" else None
    if not command:
        raise ValueError("Application is not in the approved app list or is unsupported.")
    subprocess.Popen(command, shell=False)
    return "Launched {}.".format(key.title())

def open_folder(name):
    key = str(name).strip().lower()
    folder = FOLDER_NAMES.get(key)
    if not folder or platform.system() != "Windows":
        raise ValueError("Only standard Windows user folders are supported.")
    path = Path.home() / folder
    if not path.exists():
        path.mkdir(parents=True, exist_ok=True)
    os.startfile(str(path))
    return "Opened your {} folder.".format(folder)

def get_system_info():
    battery = psutil.sensors_battery()
    return {
        "platform": "{} {}".format(platform.system(), platform.release()),
        "python": platform.python_version(),
        "cpu_percent": psutil.cpu_percent(interval=0.2),
        "memory_percent": psutil.virtual_memory().percent,
        "memory_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 1),
        "battery": None if battery is None else {
            "percent": round(battery.percent), "plugged_in": bool(battery.power_plugged)
        }
    }

def list_desktop_folders():
    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        return {"path": str(desktop), "folders": [], "count": 0}
    folders = sorted(p.name for p in desktop.iterdir() if p.is_dir())
    return {"path": str(desktop), "folders": folders, "count": len(folders)}
