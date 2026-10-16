// Does a mock open in its own window on Start, and when it is handed in does
// that window close and the dashboard behind it refresh?
//
//   node --env-file=.env.local scripts/verify/mock-window.mjs coverage/ui-audit/state.json
//
// Against a running production build and the fixture from ui-audit-fixture.mjs.
// It drives a real headless Chrome, so what it reports is what a browser does.
//
// Two traps this script exists to avoid, both of which produced a confident
// false negative while it was being written:
//
//   1. `Runtime.evaluate` is NOT a user gesture unless `userGesture: true` is
//      passed, and without a gesture every `window.open` is popup-blocked. A
//      script that forgets this measures the popup blocker, not the feature.
//   2. A mock with an attempt already in progress shows "Resume test" and no
//      Start form at all, so the click finds nothing. The run below closes any
//      open attempt of its own first.
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { launch } from "./ui-audit-cdp.mjs";

const [STATE = "coverage/ui-audit/state.json"] = process.argv.slice(2);
const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
// Trap 3, and the worst of the three because it reads as a feature failure: a
// headless Chrome from an earlier run that outlived it keeps the debugging port,
// the launch below silently ATTACHES to that browser instead of its own, and the
// run then drives a browser with another run's tabs and cookies -- reporting
// windows at paths this script never visits. So the port is per-run, and a port
// that answers at all is a refusal rather than something to attach to.
const PORT = 9400 + (process.pid % 500);
const live = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok).catch(() => false);
if (live) throw new Error(`a browser is already listening on ${PORT}; close it rather than attaching to it`);
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, saw) => {
  results.push({ name, ok });
  console.error(`${ok ? "PASS" : "FAIL"}  ${name}${saw === undefined ? "" : `  -- ${saw}`}`);
};
const paths = (list) => list.map((t) => new URL(t.url).pathname).join(" , ");

const pages = async () =>
  (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === "page");

// Reset this run's own student on this mock, and nobody else: every attempt it
// made except the fixture's own scored one, which other checks rely on. Closing
// them is not enough -- an attempt still counts against `max_attempts`, so after
// three runs the screen says "you have used every attempt" and shows no Start
// button at all.
const clearAttempts = async () => {
  const { data: spent } = await service
    .from("attempts")
    .select("id")
    .eq("student_id", state.people.student.id)
    .eq("mock_id", state.ids.mockB)
    .neq("id", state.ids.attemptB);
  if (!spent?.length) return;
  const ids = spent.map((a) => a.id);
  await service.from("attempt_responses").delete().in("attempt_id", ids);
  await service.from("attempt_sections").delete().in("attempt_id", ids);
  await service.from("attempts").delete().in("id", ids);
};
await clearAttempts();

const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const b = await launch({ port: PORT, profileRoot: "coverage/mock-window" });
// A click a browser believes a person made. Everything popup-related needs it.
const gesture = async (expression) => {
  const r = await b.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

try {
  await b.setCookies(BASE, state.people.student.cookie);
  await b.viewport(1440, 900);

  const mockPath = `/student/mocks/${state.ids.mockB}`;
  await b.navigate(`${BASE}${mockPath}`, BASE);
  // The popup is opened by a listener an effect attaches, so a click landing
  // before hydration measures nothing. Trap 3: without this wait the attempt
  // opens in the dashboard tab and the run reads as a feature failure.
  await b.sleep(2000);
  const before = await pages();

  // `prevented` separates the two ways this can fail: the listener never ran
  // (nothing cancelled the click) from the popup being refused.
  const clicked = await gesture(`(() => {
    const f = [...document.querySelectorAll("form")].find((x) => /start/i.test(x.textContent));
    if (!f) return "no form";
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    const ok = f.querySelector("button").dispatchEvent(ev);
    return ok ? "submitted here" : "prevented";
  })()`);
  check("the Start click is intercepted", clicked === "prevented", `click: ${clicked}`);
  await b.sleep(3500);

  const after = await pages();
  check("Start opens a second window", after.length === before.length + 1, `${before.length} -> ${after.length}: ${paths(after)}`);

  const exam = after.find((t) => !before.some((p) => p.id === t.id));
  check(
    "the new window is sitting the attempt",
    Boolean(exam && /\/student\/attempts\/\d+/.test(exam.url)),
    exam ? new URL(exam.url).pathname : "no new target",
  );
  check(
    "the dashboard window stays on the mock screen",
    after.some((t) => t.url.includes(mockPath)),
    paths(after),
  );

  // Hand the attempt in from the exam window, then watch both windows.
  if (exam) {
    const attemptId = Number(new URL(exam.url).pathname.split("/").pop());
    // Submitted through the database rather than by clicking through every
    // question: this script is about the windows, not about scoring, which
    // test-engine-sit.mjs already covers.
    await service
      .from("attempts")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", attemptId);

    // Reload the exam window so it renders the result screen, which is where
    // CloseOnSubmit lives and what a real hand-in lands on.
    const ws = new WebSocket(exam.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.send(JSON.stringify({ id: 1, method: "Page.navigate", params: { url: `${BASE}/student/attempts/${attemptId}` } }));
    await b.sleep(4000);

    const closed = await pages();
    check(
      "the exam window closes once the result is shown",
      !closed.some((t) => t.id === exam.id),
      `${closed.length} target(s): ${paths(closed)}`,
    );
    check(
      "the dashboard window is still open behind it",
      closed.some((t) => t.url.includes(mockPath)),
      paths(closed),
    );
    // The refresh itself, rather than merely that the window survived: the
    // dashboard was rendered before this attempt existed, so finding it in the
    // attempts table can only mean the opener was reloaded.
    const listed = await gesture(`[...document.querySelectorAll("a[href]")].some((a) => a.getAttribute("href") === "/student/attempts/${attemptId}")`);
    check("the dashboard refreshed and lists the new attempt", listed === true, `link to attempt ${attemptId}: ${listed}`);
    try { ws.close(); } catch { /* already gone */ }
  }

  // The fallback. A click with no user activation behind it is exactly what a
  // popup blocker refuses, so `window.open` returns null and the attempt must
  // open in this tab as it always did -- with no empty window left behind.
  await b.navigate(`${BASE}${mockPath}`, BASE);
  await b.sleep(2000);
  const beforeFallback = await pages();
  await b.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(() => {
      const f = [...document.querySelectorAll("form")].find((x) => /start/i.test(x.textContent));
      if (f) f.querySelector("button").click();
      return Boolean(f);
    })()`,
    returnByValue: true,
  });
  await b.sleep(4000);
  const afterFallback = await pages();
  check(
    "a refused popup starts the attempt in the same tab",
    afterFallback.length === beforeFallback.length && afterFallback.some((t) => /\/student\/attempts\/\d+/.test(t.url)),
    `${beforeFallback.length} -> ${afterFallback.length}: ${paths(afterFallback)}`,
  );

  // Operating manual §1.5: a phone attempt is unproctored for good. The request
  // that starts the attempt is now made by the NEW window, so the check is that
  // the window carries the phone with it rather than starting a desktop attempt.
  // Room is made first: `max_attempts` counts every attempt above, open or not.
  await clearAttempts();
} finally {
  await b.close();
}

// Operating manual §1.5: a phone attempt is unproctored for good. The request
// that opens the attempt is now made by the NEW window, so what is measured here
// is that the phone travels with it rather than a desktop attempt being opened.
// A second browser, because the phone has to be the browser's own `--user-agent`
// -- a per-page override does not reach a window that page opens.
const phonePort = PORT + 1;
const p = await launch({ args: [`--user-agent=${PHONE}`], port: phonePort, profileRoot: "coverage/mock-window-phone" });
try {
  await p.setCookies(BASE, state.people.student.cookie);
  await p.viewport(390, 844, true);
  await p.navigate(`${BASE}/student/mocks/${state.ids.mockB}`, BASE);
  await p.sleep(2000);
  await p.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(() => {
      const f = [...document.querySelectorAll("form")].find((x) => /start/i.test(x.textContent));
      if (f) f.querySelector("button").click();
      return Boolean(f);
    })()`,
    returnByValue: true,
    userGesture: true,
  });
  await p.sleep(4000);
  const open = (await (await fetch(`http://127.0.0.1:${phonePort}/json/list`)).json())
    .filter((t) => t.type === "page")
    .find((t) => /\/student\/attempts\/\d+/.test(t.url));
  const { data: attempt } = open
    ? await service.from("attempts").select("proctored").eq("id", Number(new URL(open.url).pathname.split("/").pop())).single()
    : { data: null };
  check(
    "a phone attempt through the exam window is still unproctored",
    attempt?.proctored === false,
    `proctored: ${attempt ? attempt.proctored : "no attempt opened"}`,
  );
} finally {
  await p.close();
  await clearAttempts();
}

const failed = results.filter((r) => !r.ok).length;
console.error(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
