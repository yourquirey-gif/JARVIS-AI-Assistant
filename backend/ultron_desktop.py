"""ULTRON desktop companion: starts the loopback-only PC agent and opens the web app."""
import os
import sys
import secrets
import threading
import webbrowser
from pathlib import Path
from urllib.parse import urlparse
import tkinter as tk
from tkinter import ttk, messagebox

DEFAULT_SITE = "https://jarvis-ai-assistant-zeta-six.vercel.app"
PORT = 8765
APP_DIR = Path(os.getenv("APPDATA", str(Path.home()))) / "ULTRON"
APP_DIR.mkdir(parents=True, exist_ok=True)
ENV_FILE = APP_DIR / ".env"
STARTUP_DIR = Path(os.getenv("APPDATA", str(Path.home()))) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"

def read_config():
    values = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    values.setdefault("ULTRON_TOKEN", secrets.token_urlsafe(32))
    values.setdefault("ALLOWED_ORIGINS", DEFAULT_SITE)
    values.setdefault("ENABLE_AUTOMATION", "false")
    return values

def save_config(values):
    ENV_FILE.write_text(
        "ULTRON_TOKEN={}\nALLOWED_ORIGINS={}\nENABLE_AUTOMATION={}\n".format(
            values["ULTRON_TOKEN"], values["ALLOWED_ORIGINS"], values["ENABLE_AUTOMATION"]
        ),
        encoding="utf-8"
    )

def site_origin(value):
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Enter the full HTTPS ULTRON website address.")
    return "{}://{}".format(parsed.scheme, parsed.netloc)

class UltronDesktop:
    def __init__(self, root):
        self.root = root
        self.root.title("ULTRON PC Companion")
        self.root.geometry("560x520")
        self.root.minsize(520, 480)
        self.root.configure(bg="#071321")
        self.values = read_config()
        if not ENV_FILE.exists():
            save_config(self.values)
        self.server = None
        self.server_thread = None
        self.running = False
        self.site_var = tk.StringVar(value=DEFAULT_SITE)
        self.enabled_var = tk.BooleanVar(value=self.values["ENABLE_AUTOMATION"].lower() == "true")
        self.startup_var = tk.BooleanVar(value=(STARTUP_DIR / "ULTRON-Desktop.bat").exists())
        self.status_var = tk.StringVar(value="Companion stopped")
        self._build()
        self._refresh_token()
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        if self.enabled_var.get():
            self.root.after(900, self.start_agent)

    def _build(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("TButton", padding=8)
        tk.Label(self.root, text="ULTRON", bg="#071321", fg="#66e8ff",
                 font=("Segoe UI", 26, "bold")).pack(pady=(18, 0))
        tk.Label(self.root, text="LOCAL PC COMPANION  |  PRIVATE LOOPBACK SERVICE",
                 bg="#071321", fg="#91acc5", font=("Segoe UI", 8)).pack(pady=(0, 18))
        frame = tk.Frame(self.root, bg="#102239", padx=18, pady=16)
        frame.pack(fill="both", expand=True, padx=18, pady=8)
        tk.Label(frame, text="ULTRON WEBSITE (HTTPS)", bg="#102239", fg="#bcd5e7",
                 font=("Segoe UI", 9, "bold")).pack(anchor="w")
        tk.Entry(frame, textvariable=self.site_var, bg="#061321", fg="white",
                 insertbackground="white", relief="flat").pack(fill="x", pady=(6, 14), ipady=8)
        tk.Checkbutton(frame, text="Enable approved PC actions (each action still asks for confirmation)",
                       variable=self.enabled_var, bg="#102239", fg="#d5e7f4",
                       activebackground="#102239", selectcolor="#12344d",
                       font=("Segoe UI", 9), wraplength=470, justify="left").pack(anchor="w", pady=(0, 14))
        tk.Label(frame, text="PRIVATE PAIRING KEY", bg="#102239", fg="#bcd5e7",
                 font=("Segoe UI", 9, "bold")).pack(anchor="w")
        token_row = tk.Frame(frame, bg="#102239")
        token_row.pack(fill="x", pady=(6, 6))
        self.token_entry = tk.Entry(token_row, show="•", bg="#061321", fg="white",
                                    insertbackground="white", relief="flat")
        self.token_entry.pack(side="left", fill="x", expand=True, ipady=8)
        ttk.Button(token_row, text="Show / hide", command=self._toggle_token).pack(side="left", padx=5)
        ttk.Button(token_row, text="Copy key", command=self._copy_token).pack(side="left")
        ttk.Button(frame, text="SAVE SETTINGS & START COMPANION", command=self.start_agent).pack(fill="x", pady=(10, 8))
        ttk.Button(frame, text="OPEN ULTRON WEBSITE", command=self.open_site).pack(fill="x", pady=4)
        ttk.Button(frame, text="Create / remove Windows startup shortcut", command=self.toggle_startup).pack(fill="x", pady=4)
        tk.Checkbutton(frame, text="Start this companion when Windows starts",
                       variable=self.startup_var, bg="#102239", fg="#91acc5",
                       activebackground="#102239", selectcolor="#12344d",
                       command=self.toggle_startup, font=("Segoe UI", 9)).pack(anchor="w", pady=(8, 0))
        tk.Label(self.root, textvariable=self.status_var, bg="#071321", fg="#75e4bd",
                 font=("Segoe UI", 9)).pack(pady=(4, 2))
        tk.Label(self.root, text="Your PC actions stay on this computer. No remote shell or silent file access.",
                 bg="#071321", fg="#718ca4", font=("Segoe UI", 8)).pack(pady=(0, 12))

    def _refresh_token(self):
        self.token_entry.delete(0, "end")
        self.token_entry.insert(0, self.values["ULTRON_TOKEN"])

    def _toggle_token(self):
        self.token_entry.configure(show="" if self.token_entry.cget("show") else "•")

    def _copy_token(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.values["ULTRON_TOKEN"])
        self.status_var.set("Pairing key copied. Paste it in ULTRON → Permissions.")

    def toggle_startup(self):
        path = STARTUP_DIR / "ULTRON-Desktop.bat"
        if self.startup_var.get():
            STARTUP_DIR.mkdir(parents=True, exist_ok=True)
            if getattr(sys, "frozen", False):
                command = '"{}"'.format(sys.executable)
            else:
                pythonw = Path(sys.executable).with_name("pythonw.exe")
                command = '"{}" "{}"'.format(pythonw if pythonw.exists() else sys.executable, Path(__file__).resolve())
            path.write_text("@echo off\nstart \"\" {}\n".format(command), encoding="utf-8")
            self.status_var.set("ULTRON will start when you sign in to Windows.")
        else:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            self.status_var.set("Windows startup shortcut removed.")

    def open_site(self):
        try:
            origin = site_origin(self.site_var.get())
        except ValueError as exc:
            messagebox.showerror("Website address", str(exc))
            return
        webbrowser.open(origin)
        self.status_var.set("ULTRON website opened. Copy the pairing key into Permissions.")

    def start_agent(self):
        try:
            origin = site_origin(self.site_var.get())
        except ValueError as exc:
            messagebox.showerror("Website address", str(exc))
            return
        self.values["ALLOWED_ORIGINS"] = origin
        self.values["ENABLE_AUTOMATION"] = "true" if self.enabled_var.get() else "false"
        save_config(self.values)
        if self.running:
            self.status_var.set("Companion already running. Restart it to apply changes.")
            return
        try:
            os.environ["ULTRON_TOKEN"] = self.values["ULTRON_TOKEN"]
            os.environ["ALLOWED_ORIGINS"] = self.values["ALLOWED_ORIGINS"]
            os.environ["ENABLE_AUTOMATION"] = self.values["ENABLE_AUTOMATION"]
            backend_dir = str(Path(__file__).resolve().parent)
            if backend_dir not in sys.path:
                sys.path.insert(0, backend_dir)
            import importlib
            import uvicorn
            import main as local_main
            importlib.reload(local_main)
            config = uvicorn.Config(local_main.app, host="127.0.0.1", port=PORT,
                                    log_level="warning", access_log=False)
            self.server = uvicorn.Server(config)
            self.server_thread = threading.Thread(target=self.server.run, daemon=True)
            self.server_thread.start()
            self.running = True
            self.status_var.set("ULTRON PC Companion is running on this PC.")
            self.root.after(900, self._check_server)
        except Exception as exc:
            self.running = False
            messagebox.showerror("Could not start ULTRON", str(exc))

    def _check_server(self):
        if not self.server_thread or not self.server_thread.is_alive():
            self.running = False
            self.status_var.set("Companion stopped. Check whether port 8765 is already in use.")

    def close(self):
        if self.server:
            self.server.should_exit = True
        self.root.after(150, self.root.destroy)

if __name__ == "__main__":
    root = tk.Tk()
    app = UltronDesktop(root)
    root.mainloop()
