// Server latency for every signed-in route of every role, against a running
// production build and the fixture ui-audit-fixture.mjs made.
//
//   node --env-file=.env.local scripts/verify/ui-audit-latency.mjs coverage/ui-audit/state.json <label> [trace.ndjson]
//
// Per route: time to first byte and to the full streamed response, cold (the
// first hit after `next start`) and warm (median of five). Requests run one at
// a time, so when the server was started with ui-audit-trace.mjs preloaded the
// Supabase calls in each request's window belong to that request: their count,
// and the "depth" -- how many of them ran one after another rather than side
// by side, which is the waterfall a page's latency is made of.
//
// Writes coverage/ui-audit/latency-<label>.json and prints a Markdown table.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { buildRoutes, freshCookies } from "./ui-audit-routes.mjs";

const [STATE = "coverage/ui-audit/state.json", LABEL = "before", TRACE = "coverage/ui-audit/trace.ndjson"] = process.argv.slice(2);
const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await freshCookies(state);
const routes = await buildRoutes(state, service);
const traceLines = () => (existsSync(TRACE) ? readFileSync(TRACE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
// The number of calls that had to wait for an earlier one: the longest chain
// of non-overlapping calls in the window.
function depth(calls) {
  const sorted = [...calls].sort((a, b) => a.t0 - b.t0);
  const chain = sorted.map(() => 1);
  for (let i = 0; i < sorted.length; i += 1)
    for (let j = 0; j < i; j += 1) if (sorted[j].t1 <= sorted[i].t0) chain[i] = Math.max(chain[i], chain[j] + 1);
  return Math.max(0, ...chain);
}

async function hit(path, who) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: state.people[who].cookie }, redirect: "manual" });
  const ttfb = Date.now() - t0;
  const body = await r.text();
  const total = Date.now() - t0;
  return { bytes: body.length, notFound: body.replace(/<script[\s\S]*?<\/script>/g, "").includes("Page not found"), status: r.status, t0, t1: Date.now(), total, ttfb };
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const rows = [];
for (const [who, paths] of Object.entries(routes)) {
  for (const path of paths) {
    const cold = await hit(path, who);
    const warm = [];
    for (let i = 0; i < 5; i += 1) warm.push(await hit(path, who));
    await new Promise((r) => setTimeout(r, 50));
    const lines = traceLines();
    const inWindow = (h) => lines.filter((c) => c.t0 >= h.t0 && c.t1 <= h.t1 + 5);
    const last = warm[warm.length - 1];
    const calls = inWindow(last);
    rows.push({
      bytes: last.bytes, calls: calls.length, coldTotal: cold.total, coldTtfb: cold.ttfb, depth: depth(calls), notFound: last.notFound,
      path, role: who, status: last.status, warmTotal: median(warm.map((w) => w.total)), warmTtfb: median(warm.map((w) => w.ttfb)),
      paths: calls.map((c) => `${c.method} ${c.path} ${c.t1 - c.t0}ms`),
    });
    const r = rows[rows.length - 1];
    console.error(`${who.padEnd(7)} ${path.padEnd(48)} ${r.status} cold ${r.coldTtfb}/${r.coldTotal} warm ${r.warmTtfb}/${r.warmTotal} calls ${r.calls} depth ${r.depth}`);
  }
}

writeFileSync(`coverage/ui-audit/latency-${LABEL}.json`, JSON.stringify(rows, null, 2));
const shorten = (p) => p.replace(state.people.student.id, ":student").replace(/\/\d+/g, "/:id");
console.log("| Role | Route | Status | Cold TTFB / total (ms) | Warm TTFB / total (ms) | Supabase calls | Sequential depth |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  const flag = r.warmTotal > 500 ? " **slow**" : "";
  console.log(`| ${r.role} | \`${shorten(r.path)}\` | ${r.status}${r.notFound ? " (not found)" : ""} | ${r.coldTtfb} / ${r.coldTotal} | ${r.warmTtfb} / ${r.warmTotal}${flag} | ${r.calls} | ${r.depth} |`);
}
