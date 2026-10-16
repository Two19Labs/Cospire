// Does a proctored sitting keep its full screen across a section change, and
// does the platform's own navigation stay out of `proctor_events`?
//
//   node --env-file=.env.local scripts/verify/exam-fullscreen.mjs coverage/ui-audit/state.json
//
// This is the measurement behind the PR #80 follow-up. #80 made
// `ActionBoundary` follow a caught redirect with `window.location`, and a full
// document load always exits browser full screen, so every redirect inside the
// exam cost the student their full screen and could log a `fullscreen_exit`
// the platform itself caused.
//
// Clicks here go through `Input.dispatchMouseEvent`, not `element.click()`, so
// Chrome counts them as a user gesture and `requestFullscreen` is allowed --
// a scripted click is refused and would prove nothing.
//
// Each step is scored from the page and the database together:
//   fullscreen   `document.fullscreenElement` after the step
//   same doc     a token written into the window survives, so no document load
//   events       rows in `proctor_events` for this attempt, which must not
//                grow for a move the platform made, and must grow for a real
//                exit (Escape, at the end).
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { launch } from "./ui-audit-cdp.mjs";
import { freshCookies } from "./ui-audit-routes.mjs";

const [STATE = "coverage/ui-audit/state.json"] = process.argv.slice(2);
const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

await freshCookies(state);
const b = await launch({ port: 9337 });
const rows = [];
let failures = 0;

async function settle() {
  await b.sleep(200);
  await b.idle(BASE, 350, 15000);
  await b.sleep(200);
}

// A click Chrome treats as a user gesture: the element's own centre, pressed
// and released, rather than `element.click()`.
async function press(text, { exact = true, selector = "a, button" } = {}) {
  const box = await b.evaluate(`(() => {
    const want = ${JSON.stringify(text)};
    const norm = (s) => s.replace(/\\s+/g, " ").trim();
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => e.getClientRects().length && !e.disabled);
    const hit = els.find((e) => ${exact} ? norm(e.textContent) === want : norm(e.textContent).includes(want));
    if (!hit) return null;
    hit.scrollIntoView({ block: "center" });
    const r = hit.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!box) throw new Error(`nothing to press: "${text}"`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await b.send("Input.dispatchMouseEvent", { button: "left", clickCount: 1, type, x: box.x, y: box.y });
  }
  await settle();
}

// Two independent readings of "was this one document throughout": a token on
// the window, which a new document would not carry, and the count of document
// requests to the app, which a `window.location` navigation would raise.
const docs = () => b.requests.filter((r) => r.type === "Document" && r.url.startsWith(BASE)).length;
const mark = async () => ({ docs: docs(), token: await b.evaluate(`window.__examMark = "tok-${Math.random().toString(36).slice(2)}"`) });
const held = async (m) => (await b.evaluate(`window.__examMark === ${JSON.stringify(m.token)}`)) && docs() === m.docs;
const inFullscreen = () => b.evaluate("!!document.fullscreenElement");

async function eventCount(attemptId) {
  const { count, error } = await service.from("proctor_events").select("id", { count: "exact", head: true }).eq("attempt_id", attemptId);
  if (error) throw error;
  return count ?? 0;
}

function record(step, { events, fullscreen, sameDoc, wantEvents, wantFullscreen }) {
  const ok = fullscreen === wantFullscreen && (sameDoc === null || sameDoc) && events === wantEvents;
  if (!ok) failures += 1;
  rows.push({ events, fullscreen, ok, sameDoc, step, wantEvents, wantFullscreen });
  console.error(
    `${ok ? "ok  " : "FAIL"} ${step.padEnd(34)} fullscreen ${String(fullscreen).padEnd(5)} (want ${wantFullscreen})  ` +
      `same document ${String(sameDoc).padEnd(5)}  proctor_events ${events} (want ${wantEvents})`,
  );
}

try {
  const mockA = state.ids.mockA;
  const student = state.people.student;
  // Each run sits mock A afresh.
  await service.from("attempts").delete().eq("mock_id", mockA).eq("student_id", student.id);

  await b.viewport(1440, 900);
  await b.setCookies(BASE, student.cookie);
  await b.navigate(`${BASE}/student/mocks/${mockA}`, BASE);

  // ---- Start. A document load by design: its action redirects, and the mock
  // will shortly open in a window of its own, so full screen cannot be asked
  // for here at all. The exam asks for it with its own first click instead.
  const atStart = await mark();
  await press("Start test", { selector: "button" });
  const startKept = await held(atStart);
  const path = await b.evaluate("location.pathname");
  const attemptId = Number(path.split("/").pop());
  if (!Number.isSafeInteger(attemptId) || attemptId <= 0) throw new Error(`did not reach an attempt: ${path}`);
  const proctored = await b.evaluate(`document.body.innerText.includes("Proctored")`);
  if (!proctored) throw new Error("not the proctored exam screen");
  rows.push({ step: "start (document load, by design)" });
  console.error(
    `--   start                              fullscreen ${await inFullscreen()}  same document ${startKept}  proctor_events ${await eventCount(attemptId)}`,
  );

  // ---- The exam's own first click. `startAttemptAction` enters the first
  // section itself, so a sectioned paper opens on a question rather than a
  // "Begin" card, and `ProctorWatch`'s banner is where the student asks for
  // full screen.
  //
  // Headless Chrome keeps a full screen across a same-origin document load,
  // where a real browser drops it, so the banner is sometimes already gone
  // here. Pressing it is therefore best-effort; what the run really measures
  // is below -- whether the section change stays inside one document.
  let token = await mark();
  await press("Enter full screen", { selector: "button" }).catch(() => undefined);
  const entered = await inFullscreen();
  record("enter full screen (proctor banner)", {
    events: await eventCount(attemptId),
    fullscreen: entered,
    sameDoc: await held(token),
    wantEvents: 0,
    wantFullscreen: true,
  });
  if (!entered) {
    console.error("\nThis headless Chrome refused full screen on a dispatched click.");
    console.error("The rest is still measured: the section change must stay in one document and log nothing.");
  }

  // ---- Move a question first. This matters: moving writes `?q=N` into the
  // address with `history.replaceState`, so the redirect the section change
  // used to end in -- back to the bare address -- was a redirect to a
  // DIFFERENT url, which is the kind `ActionBoundary` follows with
  // `window.location`. A student who has looked at a second question is the
  // normal case, not the edge one.
  await press("Save and next", { selector: "button" });
  const q = await b.evaluate("location.search");
  if (!q.includes("q=")) throw new Error(`moving a question did not set ?q=: "${q}"`);

  // ---- Leave the section for the next one: the move the fix is about.
  token = await mark();
  const was = await b.evaluate(`document.querySelector('[aria-current="step"]')?.textContent ?? ""`);
  await press("Next section", { selector: "button" });
  await press("Leave section", { selector: "button" });
  const now = await b.evaluate(`document.querySelector('[aria-current="step"]')?.textContent ?? ""`);
  if (now === was) throw new Error(`the paper did not move on: still "${was}"`);
  console.error(`     section "${was}" -> "${now}"`);
  record("section 1 -> section 2", {
    events: await eventCount(attemptId),
    fullscreen: await inFullscreen(),
    sameDoc: await held(token),
    wantEvents: 0,
    wantFullscreen: entered,
  });

  // ---- The countdown reaching zero. The clock itself cannot be wound
  // forward -- the database refuses it, "a section cannot be re-clocked or
  // moved", which is rule 1 doing its job -- so the countdown's own hidden
  // button is pressed, which is exactly what `Countdown` does at zero and the
  // same code path. This hop redirected to a DIFFERENT address (`?auto=1`),
  // and a different address is what `ActionBoundary` follows with
  // `window.location`.
  token = await mark();
  const fired = await b.evaluate(`(() => { const el = document.getElementById("timeup-button"); if (!el) return false; el.click(); return true; })()`);
  if (!fired) throw new Error("no time-up button on the sitting");
  await settle();
  record("time up (the countdown's button)", {
    events: await eventCount(attemptId),
    fullscreen: await inFullscreen(),
    sameDoc: await held(token),
    wantEvents: 0,
    wantFullscreen: entered,
  });

  // ---- A real exit is still recorded. Escape leaves full screen; where
  // headless refused it in the first place, a tab switch is the stand-in.
  const before = await eventCount(attemptId);
  if (entered) {
    for (const type of ["keyDown", "keyUp"]) {
      await b.send("Input.dispatchKeyEvent", { code: "Escape", key: "Escape", nativeVirtualKeyCode: 27, type, windowsVirtualKeyCode: 27 });
    }
  } else {
    await b.evaluate(`Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange"))`);
  }
  await b.sleep(1500);
  const after = await eventCount(attemptId);
  const kind = entered ? "escape leaves full screen" : "tab hidden (full screen refused)";
  const realOk = after > before;
  if (!realOk) failures += 1;
  rows.push({ events: after, ok: realOk, step: kind, wantEvents: `> ${before}` });
  console.error(`${realOk ? "ok  " : "FAIL"} ${kind.padEnd(34)} proctor_events ${before} -> ${after} (want a new row)`);

  const kinds = await service.from("proctor_events").select("event_type").eq("attempt_id", attemptId);
  console.error(`\nproctor_events for attempt ${attemptId}: ${kinds.data?.map((r) => r.event_type).join(", ") || "none"}`);
  console.error(`browser problems: ${b.problems.length ? b.problems.map((p) => `${p.kind}: ${p.text}`).join(" | ") : "none"}`);
  console.error(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`} -- ${rows.length} steps`);
} finally {
  await b.close();
}
process.exit(failures === 0 ? 0 : 1);
