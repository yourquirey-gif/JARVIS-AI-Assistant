import { readFile, writeFile } from "node:fs/promises";

const packageUrl = new URL("../package.json", import.meta.url);
const manifestUrl = new URL("../public/app-updates/web.json", import.meta.url);

const packageInfo = JSON.parse(await readFile(packageUrl, "utf8"));
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

manifest.version = packageInfo.version;
manifest.releaseNotes =
  "ULTRON website update. Refresh the web app to load the latest interface, permissions and voice features.";

await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + "\n", "utf8");
process.stdout.write(`Web update manifest set to ULTRON ${packageInfo.version}\n`);
