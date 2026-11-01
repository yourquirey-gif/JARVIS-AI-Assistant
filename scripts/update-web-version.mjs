import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
manifest_path = root / "public" / "app-updates" / "web.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["version"] = package["version"]
manifest["releaseNotes"] = (
    "ULTRON website update. Refresh the web app to load the latest interface, "
    "permissions and voice features."
)
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Web update manifest set to ULTRON {package['version']}")
