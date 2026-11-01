import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { AppLauncher } from "@capacitor/app-launcher";
import { Calculator, Chrome, Mail, MapPin, MessageCircle, Phone, Play, Settings, Smartphone, Youtube } from "lucide-react";

export const ANDROID_APP_CATALOG = [
  { id: "whatsapp", name: "WhatsApp", packageName: "com.whatsapp", aliases: ["whatsapp", "वॉट्सऐप"], icon: MessageCircle },
  { id: "youtube", name: "YouTube", packageName: "com.google.android.youtube", aliases: ["youtube", "यूट्यूब"], icon: Youtube },
  { id: "chrome", name: "Chrome", packageName: "com.android.chrome", aliases: ["chrome", "क्रोम"], icon: Chrome },
  { id: "gmail", name: "Gmail", packageName: "com.google.android.gm", aliases: ["gmail", "जीमेल"], icon: Mail },
  { id: "maps", name: "Google Maps", packageName: "com.google.android.apps.maps", aliases: ["maps", "google maps", "गूगल मैप"], icon: MapPin },
  { id: "phone", name: "Phone", packageName: "com.google.android.dialer", aliases: ["phone", "dialer", "फोन", "डायलर"], icon: Phone },
  { id: "messages", name: "Messages", packageName: "com.google.android.apps.messaging", aliases: ["messages", "sms", "मैसेज"], icon: MessageCircle },
  { id: "calculator", name: "Calculator", packageName: "com.google.android.calculator", fallbackPackages: ["com.sec.android.app.popupcalculator"], aliases: ["calculator", "calc", "कैलकुलेटर"], icon: Calculator },
  { id: "playstore", name: "Play Store", packageName: "com.android.vending", aliases: ["play store", "playstore", "प्ले स्टोर"], icon: Play },
  { id: "settings", name: "Settings", packageName: "com.android.settings", aliases: ["settings", "सेटिंग", "सेटिंग्स"], icon: Settings }
];

const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z0-9_]+)+$/;

export async function openAndroidApp(packageName) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error("App launch is available only in the installed ULTRON Android app.");
  }
  if (!PACKAGE_PATTERN.test(String(packageName || ""))) {
    throw new Error("Enter a valid Android package name.");
  }
  const result = await AppLauncher.openUrl({ url: packageName });
  if (result && result.completed === false) {
    throw new Error("Android could not open that app. Check that it is installed.");
  }
  return true;
}

export function matchAndroidAppCommand(command) {
  const value = String(command || "").trim().toLocaleLowerCase();
  const match = value.match(/^(?:please\\s+)?(?:open|launch|start|kholo|khol\\s*do|chalao|चालू\\s*करो|खोलो|खोल\\s*दो)\\s+(.+?)[.!?]*$/i);
  if (!match) return null;
  const target = match[1].trim().replace(/[.!?]+$/, "");
  return ANDROID_APP_CATALOG.find((app) => app.aliases.some((alias) => alias.toLocaleLowerCase() === target)) || null;
}

export default function AndroidAppLauncher() {
  const [customPackage, setCustomPackage] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState("");

  const open = async (app) => {
    setBusyId(app.id || "custom");
    setStatus("Opening " + app.name + "…");
    try {
      const candidates = [app.packageName, ...(app.fallbackPackages || [])];
      let lastError;
      for (const packageName of candidates) {
        try {
          await openAndroidApp(packageName);
          setStatus(app.name + " opened. ULTRON has not read or changed anything inside it.");
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Could not open the selected app.");
    } catch (error) {
      setStatus(error?.message || "Could not open the selected app.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="androidAppControls">
      <div className="androidAppGrid">
        {ANDROID_APP_CATALOG.map((app) => {
          const Icon = app.icon;
          return (
            <button key={app.id} type="button" disabled={Boolean(busyId)} onClick={() => open(app)}>
              <Icon />
              <span>{app.name}</span>
              {busyId === app.id && <small>OPENING…</small>}
            </button>
          );
        })}
      </div>
      <details className="androidCustomLaunch">
        <summary>Open another app by package name</summary>
        <div>
          <input value={customPackage} onChange={(event) => setCustomPackage(event.target.value)} placeholder="com.example.app" autoCapitalize="none" autoCorrect="off" />
          <button type="button" disabled={Boolean(busyId) || !PACKAGE_PATTERN.test(customPackage.trim())} onClick={() => open({ id: "custom", name: "Selected app", packageName: customPackage.trim() })}>
            <Smartphone /> OPEN
          </button>
        </div>
      </details>
      {status && <p className="androidAppStatus" role="status">{status}</p>}
      <p className="androidAppHint">ULTRON can open the selected app. It cannot read its private screens or type into it in this version. App launch starts only after your tap or a clearly spoken open command.</p>
    </div>
  );
}
