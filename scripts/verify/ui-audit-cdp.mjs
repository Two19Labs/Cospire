// A small Chrome DevTools Protocol driver for the UI audit, over Node's global
// WebSocket. No dependency: it launches its own headless Chrome with a
// throwaway profile under coverage/, never attaches to a browser it did not
// start, and kills what it launched in close().
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// Injected before every document: LCP and layout shift observers, and a
// recorder for what the screen shows after a click -- skeleton or not, the
// heading, the breadcrumb, the highlighted nav item -- every time it changes.
const RECORDER = String.raw`
(() => {
  const a = (window.__audit = { lcp: 0, cls: 0, timeline: [], t0: 0, clsSince: 0 });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) a.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { a.cls += e.value; if (a.t0 && e.startTime >= a.t0) a.clsSince += e.value; } }).observe({ type: "layout-shift", buffered: true }); } catch {}
  const text = (sel) => (document.querySelector(sel)?.textContent ?? "").replace(/\s+/g, " ").trim();
  a.snap = () => ({
    busy: !!document.querySelector('main[aria-busy="true"]'),
    crumb: text(".app-breadcrumb__here"),
    h1: text("main h1"),
    nav: document.querySelector('.app-nav [aria-current="page"]')?.getAttribute("href") ?? "",
    path: location.pathname + location.search,
    shell: !!document.querySelector(".app-shell"),
  });
  let last = "";
  const note = () => {
    if (!a.t0) return;
    const s = a.snap();
    const key = JSON.stringify(s);
    if (key !== last) { last = key; a.timeline.push({ t: Math.round(performance.now() - a.t0), ...s }); }
  };
  a.track = () => { a.t0 = performance.now(); a.timeline = []; a.clsSince = 0; last = ""; note(); };
  const start = () => new MutationObserver(note).observe(document.documentElement, { attributes: true, characterData: true, childList: true, subtree: true });
  if (document.documentElement) start(); else addEventListener("DOMContentLoaded", start);
})();`;

export async function launch({ port = 9333, profileRoot = "coverage/ui-audit" } = {}) {
  const profile = resolve(profileRoot, `chrome-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "--mute-audio", "about:blank",
  ], { stdio: "ignore" });
  let target = null;
  for (let i = 0; i < 50 && !target; i += 1) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message}`)); else res(msg.result);
    } else if (msg.method) for (const fn of handlers.get(msg.method) ?? []) fn(msg.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const on = (method, fn) => { if (!handlers.has(method)) handlers.set(method, []); handlers.get(method).push(fn); };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  await send("Performance.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });

  // Console errors, uncaught exceptions and failed or erroring requests.
  const problems = [];
  const inflight = new Map();
  const requests = [];
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error" || p.type === "warning") problems.push({ kind: `console.${p.type}`, text: p.args.map((x) => x.value ?? x.description ?? "").join(" ").slice(0, 300) }); });
  on("Runtime.exceptionThrown", (p) => problems.push({ kind: "exception", text: (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 300) }));
  on("Log.entryAdded", (p) => { if (p.entry.level === "error") problems.push({ kind: "log", text: `${p.entry.text} ${p.entry.url ?? ""}`.slice(0, 300) }); });
  on("Network.requestWillBeSent", (p) => { inflight.set(p.requestId, { t: Date.now(), type: p.type, url: p.request.url, method: p.request.method, headers: p.request.headers }); requests.push({ id: p.requestId, method: p.request.method, t: Date.now(), type: p.type, url: p.request.url, rsc: !!p.request.headers?.RSC || !!p.request.headers?.rsc, action: !!(p.request.headers?.["Next-Action"] || p.request.headers?.["next-action"]), prefetch: !!(p.request.headers?.["Next-Router-Prefetch"] || p.request.headers?.["next-router-prefetch"]) }); });
  on("Network.responseReceived", (p) => { if (p.response.status >= 400) problems.push({ kind: `http ${p.response.status}`, text: p.response.url.slice(0, 200) }); });
  on("Network.loadingFinished", (p) => { inflight.delete(p.requestId); const r = requests.findLast((x) => x.id === p.requestId); if (r) r.end = Date.now(); });
  on("Network.loadingFailed", (p) => { const r = inflight.get(p.requestId); inflight.delete(p.requestId); if (!p.canceled && r) problems.push({ kind: "failed", text: `${p.errorText} ${r.url.slice(0, 200)}` }); });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { awaitPromise: true, expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Quiet: no request to the app in flight for `quiet` ms.
  const idle = async (base, quiet = 350, max = 15000) => {
    const start = Date.now();
    let calm = Date.now();
    while (Date.now() - start < max) {
      const busy = [...inflight.values()].some((r) => r.url.startsWith(base) && !r.url.includes("/_next/static/"));
      if (busy) calm = Date.now();
      else if (Date.now() - calm >= quiet) return Date.now() - start;
      await sleep(25);
    }
    return Date.now() - start;
  };

  return {
    close: async () => {
      try { await send("Browser.close"); } catch { /* already gone */ }
      await sleep(500);
      try { proc.kill(); } catch { /* exited */ }
      try { rmSync(profile, { force: true, recursive: true }); } catch { /* locked; harmless under coverage/ */ }
    },
    evaluate,
    idle,
    on,
    problems,
    requests,
    send,
    sleep,
    async setCookies(base, cookieHeader) {
      await send("Network.clearBrowserCookies");
      const host = new URL(base).hostname;
      for (const part of cookieHeader.split("; ")) {
        const i = part.indexOf("=");
        await send("Network.setCookie", { domain: host, httpOnly: false, name: part.slice(0, i), path: "/", secure: base.startsWith("https:"), value: part.slice(i + 1) });
      }
    },
    async viewport(width, height, mobile = false) {
      await send("Emulation.setDeviceMetricsOverride", { deviceScaleFactor: 1, height, mobile, width });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
    },
    async navigate(url, base) {
      const loaded = new Promise((res) => { const fn = () => res(); on("Page.loadEventFired", fn); });
      const t0 = Date.now();
      await send("Page.navigate", { url });
      await Promise.race([loaded, sleep(20000)]);
      await idle(base);
      await sleep(300);
      const perf = await evaluate(`(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), lcp: Math.round(__audit.lcp), cls: +__audit.cls.toFixed(4), transfer: n.transferSize, path: location.pathname + location.search }; })()`);
      return { ...perf, wall: Date.now() - t0 };
    },
    async screenshot(file) {
      const { cssContentSize } = await send("Page.getLayoutMetrics");
      const { data } = await send("Page.captureScreenshot", { captureBeyondViewport: true, clip: { height: Math.min(Math.ceil(cssContentSize.height), 8000), scale: 1, width: Math.ceil(cssContentSize.width), x: 0, y: 0 }, format: "png" });
      writeFileSync(file, Buffer.from(data, "base64"));
    },
  };
}
