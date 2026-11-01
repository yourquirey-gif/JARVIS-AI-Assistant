"""Allowlisted local desktop actions. No arbitrary shell execution."""
import platform
import subprocess
import webbrowser
from pathlib import Path
import psutil

WEBSITES = {
    "youtube": "https://www.youtube.com",
    "google": "https://www.google.com",
    "github": "https://github.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
}
WINDOWS_APPS = {
    "notepad": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "paint": ["mspaint.exe"],
    "command prompt": ["cmd.exe"],
}

def open_website(name):
    key = str(name).strip().lower()
    if key not in WEBSITES:
        raise ValueError("Website is not in the approved list.")
    webbrowser.open_new_tab(WEBSITES[key])
    return "Opened {} in your default browser.".format(key.title())

def launch_app(name):
    key = str(name).strip().lower()
    command = WINDOWS_APPS.get(key) if platform.system() == "Windows" else None
    if not command:
        raise ValueError("Application is not approved or not supported on this operating system.")
    subprocess.Popen(command, shell=False)
    return "Launched {}.".format(key.title())

def get_system_info():
    battery = psutil.sensors_battery()
    return {
        "platform": "{} {}".format(platform.system(), platform.release()),
        "python": platform.python_version(),
        "cpu_percent": psutil.cpu_percent(interval=0.1),
        "memory_percent": psutil.virtual_memory().percent,
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
