"use strict";

const assert = require("assert");
const http = require("http");
const { createPcService } = require("../desktop/pc-service.cjs");

const PORT = Number(process.env.ULTRON_PORT || 18765);
const SERVICE_PORT = PORT + 1;
const TOKEN = "ultron-pc-service-smoke-test-token";
const ORIGIN = "https://example.com";
const opened = [];

function request(method, pathname, options) {
  const config = options || {};
  const body = config.body ? JSON.stringify(config.body) : "";
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: SERVICE_PORT,
      path: pathname,
      method,
      headers: {
        ...(config.origin ? { Origin: config.origin } : {}),
        ...(config.token ? { "X-Ultron-Token": config.token } : {}),
        ...(body ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        } : {}),
        ...(config.headers || {})
      }
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });
    req.on("error", reject);
    req.setTimeout(4000, () => req.destroy(new Error("Smoke-test HTTP request timed out.")));
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const service = createPcService({
    app: {
      getPath(name) {
        if (name === "home") return process.env.USERPROFILE || process.cwd();
        if (name === "desktop") return process.cwd();
        return process.cwd();
      }
    },
    shell: {
      async openExternal(url) { opened.push(url); },
      async openPath() { return ""; }
    },
    token: TOKEN,
    trustedOrigin: ORIGIN,
    automationEnabled: true,
    port: SERVICE_PORT
  });

  const blocker = http.createServer((_request, response) => response.end("occupied"));
  await new Promise((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(PORT, "127.0.0.1", resolve);
  });

  try {
    await service.start();
    assert.strictEqual(service.listening, true, "local Node service should listen");
    assert.strictEqual(service.port, SERVICE_PORT, "service should report its fallback localhost port");

    const health = await request("GET", "/api/health");
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.ok, true);
    assert.strictEqual(health.data.engine, "electron-node");

    const preflight = await request("OPTIONS", "/api/auto-pair", {
      origin: ORIGIN,
      headers: { "Access-Control-Request-Private-Network": "true" }
    });
    assert.strictEqual(preflight.status, 204);
    assert.strictEqual(preflight.headers["access-control-allow-origin"], ORIGIN);
    assert.strictEqual(preflight.headers["access-control-allow-private-network"], "true");

    const pairing = await request("GET", "/api/auto-pair", { origin: ORIGIN });
    assert.strictEqual(pairing.status, 200);
    assert.strictEqual(pairing.data.token, TOKEN);

    const blockedPairing = await request("GET", "/api/auto-pair", { origin: "https://not-trusted.example" });
    assert.strictEqual(blockedPairing.status, 403);

    const pair = await request("POST", "/api/pair", {
      origin: ORIGIN,
      body: { token: TOKEN }
    });
    assert.strictEqual(pair.status, 200);
    assert.strictEqual(pair.data.paired, true);

    const command = await request("POST", "/api/command", {
      origin: ORIGIN,
      token: TOKEN,
      body: { message: "open google", language: "en-IN" }
    });
    assert.strictEqual(command.status, 200);
    assert.strictEqual(command.data.proposed_action.name, "open_website");

    const invalidToken = await request("POST", "/api/command", {
      origin: ORIGIN,
      token: "wrong-token",
      body: { message: "open google" }
    });
    assert.strictEqual(invalidToken.status, 401);

    const action = await request("POST", "/api/action/execute", {
      origin: ORIGIN,
      token: TOKEN,
      body: { action: "open_website", args: { name: "google" } }
    });
    assert.strictEqual(action.status, 200);
    assert.strictEqual(action.data.ok, true);
    assert.deepStrictEqual(opened, ["https://www.google.com"]);

    const invalidAction = await request("POST", "/api/action/execute", {
      origin: ORIGIN,
      token: TOKEN,
      body: { action: "run_shell", args: { command: "whoami" } }
    });
    assert.strictEqual(invalidAction.status, 400);

    console.log("ULTRON Node PC service smoke test passed: health, private-network CORS, origin allowlist, pairing, token auth, command routing and approved action execution.");
  } finally {
    await service.close();
    await new Promise((resolve) => blocker.close(() => resolve()));
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
