// Выполнить JS в WebView Umbra на телевизоре (только debug-сборка).
// Использование: node android-tv/tools/tv-eval.mjs "<выражение>" [ip:порт]
// Пробрасывает DevTools-сокет WebView через adb и вызывает Runtime.evaluate.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const expr = process.argv[2] ?? "location.href";
const device = process.argv[3] ?? "192.168.1.175:5555";
const adb = `${homedir()}/Library/Android/sdk/platform-tools/adb`;
const run = (...args) =>
  execFileSync(adb, ["-s", device, ...args], { encoding: "utf8" });

// The debug build (only it lets DevTools in); UMBRA_TV_APP for another one.
const pid = run(
  "shell",
  "pidof",
  process.env.UMBRA_TV_APP || "app.umbra.tv.dev",
).trim();
if (!pid) throw new Error("Umbra не запущена на телевизоре");
run("forward", "tcp:9333", `localabstract:webview_devtools_remote_${pid}`);
const pages = await (await fetch("http://127.0.0.1:9333/json")).json();
const page = pages.find((p) => p.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
ws.send(
  JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression: expr, awaitPromise: true, returnByValue: true },
  }),
);
const reply = await new Promise((r) =>
  ws.addEventListener("message", (e) => r(JSON.parse(e.data))),
);
console.log(
  JSON.stringify(reply.result?.result?.value ?? reply.result ?? reply, null, 2),
);
ws.close();
