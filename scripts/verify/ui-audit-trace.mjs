// Preloaded into `next start` for the UI audit, to count the Supabase round
// trips each route makes and whether they run one after another:
//
//   UI_AUDIT_TRACE=coverage/ui-audit/trace.ndjson \
//     NODE_OPTIONS="--import ./scripts/verify/ui-audit-trace.mjs" npx next start -p 3090
//
// Every outgoing fetch to the Supabase host is appended as one JSON line with
// its start and end times. ui-audit-latency.mjs requests routes one at a time
// and attributes each line to the route whose window contains it. Nothing here
// logs a header, a body or a key: method, path and timings only.
import { appendFileSync } from "node:fs";

const out = process.env.UI_AUDIT_TRACE;
// Read lazily: `next start` loads .env.local after this preload has run.
const host = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null);

if (out && typeof globalThis.fetch === "function") {
  const original = globalThis.fetch;
  globalThis.fetch = async function traced(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const h = host();
    if (!url || !h || !url.includes(h)) return original(input, init);
    const t0 = Date.now();
    try {
      return await original(input, init);
    } finally {
      const u = new URL(url);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      appendFileSync(out, `${JSON.stringify({ method, path: u.pathname, t0, t1: Date.now() })}\n`);
    }
  };
}
