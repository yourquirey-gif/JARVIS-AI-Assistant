"""Safe, allowlisted Windows actions for the ULTRON local companion."""
import os
import ctypes
from ctypes import wintypes
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

def type_text(value):
    """Type Unicode text into the currently focused Windows control."""
    if platform.system() != "Windows":
        raise ValueError("Typing into other apps is supported on Windows desktop only.")
    text = str(value or "")
    if not text.strip() or len(text) > 1000:
        raise ValueError("Dictation text must contain 1 to 1000 characters.")

    INPUT_KEYBOARD = 1
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004
    VK_RETURN = 0x0D
    VK_TAB = 0x09

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                    ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                    ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                    ("dwExtraInfo", ctypes.c_size_t)]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD),
                    ("wParamH", wintypes.WORD)]

    class INPUTUNION(ctypes.Union):
        _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("data",)
        _fields_ = [("type", wintypes.DWORD), ("data", INPUTUNION)]

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    send_input = user32.SendInput
    send_input.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
    send_input.restype = wintypes.UINT

    events = []

    def add_key(vk, flags):
        down = INPUT()
        down.type = INPUT_KEYBOARD
        down.ki = KEYBDINPUT(vk, 0, flags, 0, 0)
        up = INPUT()
        up.type = INPUT_KEYBOARD
        up.ki = KEYBDINPUT(vk, 0, flags | KEYEVENTF_KEYUP, 0, 0)
        events.extend((down, up))

    def add_unicode(unit):
        down = INPUT()
        down.type = INPUT_KEYBOARD
        down.ki = KEYBDINPUT(0, unit, KEYEVENTF_UNICODE, 0, 0)
        up = INPUT()
        up.type = INPUT_KEYBOARD
        up.ki = KEYBDINPUT(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, 0)
        events.extend((down, up))

    for character in text:
        if character == "\r":
            continue
        if character == "\n":
            add_key(VK_RETURN, 0)
        elif character == "\t":
            add_key(VK_TAB, 0)
        else:
            units = character.encode("utf-16-le", errors="surrogatepass")
            for offset in range(0, len(units), 2):
                add_unicode(units[offset] | (units[offset + 1] << 8))

    if not events:
        raise ValueError("No text characters were available to type.")

    for offset in range(0, len(events), 256):
        batch_items = events[offset:offset + 256]
        batch = (INPUT * len(batch_items))(*batch_items)
        ctypes.set_last_error(0)
        sent = int(send_input(len(batch), batch, ctypes.sizeof(INPUT)))
        if sent != len(batch):
            code = ctypes.get_last_error()
            if code == 5:
                raise OSError("Windows blocked typing into the focused app. Make sure the target app is not running as Administrator and is in the foreground.")
            raise OSError("Windows accepted only {} of {} keyboard events (error {}). Click the target text field and try again.".format(sent, len(batch), code))

    return "Typed the requested text into the currently focused app or website."

def delete_user_file(folder, name):
    """Move one explicitly named file from a standard user folder to the Windows Recycle Bin."""
    if platform.system() != "Windows":
        raise ValueError("File deletion is available in the Windows desktop companion only.")
    key = str(folder or "").strip().lower()
    folder_name = FOLDER_NAMES.get(key)
    filename = str(name or "").strip()
    if not folder_name:
        raise ValueError("Choose Desktop, Documents, Downloads, Pictures, Music, or Videos.")
    if (not filename or len(filename) > 180 or filename in (".", "..")
            or Path(filename).name != filename or any(ch in filename for ch in '\\\\/:<>:"|?*')):
        raise ValueError("Provide one exact file name without a folder path.")
    root = (Path.home() / folder_name).resolve()
    target = (root / filename).resolve()
    if target.parent != root:
        raise ValueError("The requested item is outside the selected user folder.")
    if not target.exists() or target.is_symlink() or not target.is_file():
        raise ValueError("For safety, ULTRON can move one existing regular file, not a folder or link.")
    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", wintypes.WORD),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]
    source = ctypes.create_unicode_buffer(str(target) + "\0")
    operation = SHFILEOPSTRUCTW()
    operation.hwnd = None
    operation.wFunc = 3  # FO_DELETE
    operation.pFrom = ctypes.cast(source, wintypes.LPCWSTR)
    operation.pTo = None
    operation.fFlags = 0x0040 | 0x0010 | 0x0004 | 0x0400  # Recycle Bin, quiet UI
    operation.fAnyOperationsAborted = False
    operation.hNameMappings = None
    operation.lpszProgressTitle = None
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    shell32.SHFileOperationW.argtypes = [ctypes.POINTER(SHFILEOPSTRUCTW)]
    shell32.SHFileOperationW.restype = ctypes.c_int
    result = int(shell32.SHFileOperationW(ctypes.byref(operation)))
    if result != 0 or operation.fAnyOperationsAborted:
        raise OSError("Windows could not move the selected file to the Recycle Bin (error {}).".format(result))
    return "Moved {} from {} to the Windows Recycle Bin. You can restore it from there.".format(filename, key)

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
    try:
        disk_percent = psutil.disk_usage(str(Path.home())).percent
    except OSError:
        disk_percent = 0
    try:
        network = psutil.net_io_counters()
        network_sent_mb = round(network.bytes_sent / (1024 ** 2), 1)
        network_recv_mb = round(network.bytes_recv / (1024 ** 2), 1)
    except (AttributeError, OSError):
        network_sent_mb = 0
        network_recv_mb = 0
    return {
        "platform": "{} {}".format(platform.system(), platform.release()),
        "python": platform.python_version(),
        "cpu_percent": psutil.cpu_percent(interval=0.2),
        "memory_percent": psutil.virtual_memory().percent,
        "memory_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 1),
        "disk_percent": disk_percent,
        "network_sent_mb": network_sent_mb,
        "network_recv_mb": network_recv_mb,
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
