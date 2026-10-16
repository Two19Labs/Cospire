// Scripted reproduction of defect C2 (docs/ui-audit-2026-10-09.md): a save's
// redirect is sometimes never followed on screen although the server finished
// the write.
//
//   node --env-file=.env.local scripts/verify/ui-audit-fixture.mjs setup coverage/ui-audit/state.json http://127.0.0.1:3040
//   node --env-file=.env.local scripts/verify/c2-repro.mjs coverage/ui-audit/state.json before 25
//
// One click, repeated: "Remove access"/"Grant access" on the first student row
// of the fixture programme, which posts `setCourseAccessAction` and ends in a
// `redirect()` back to the same screen carrying a notice. The audit measured
// the action answering 303 in about 200 ms and the client then never
// dispatching the navigation, leaving the button on "Removing…" for good.
//
// Each click is scored from the page itself, never from the network:
//
// The only question asked of each click is the one the admin cares about: did
// the save show up on screen? The row's `intent` field is the answer, because
// it reads "revoke" exactly when the screen believes the student is on the
// programme, so comparing it with the database says whether the admin is
// looking at the truth. A click is
//
//   ok     the screen agreed with the database within SETTLE_MS and the
//          button came off its pending label
//   stuck  it did not: the write landed and the screen still shows the old
//          state. This is C2.
//
// Two shapes of stuck were measured on 2026-10-13, and both are counted:
// the common one leaves the button on "Removing…" for good with the
// ActionBoundary never engaging at all, and the rarer one engages the
// boundary, which then never releases. `boundary` records which.
//
// `window.__c2mark` is stamped before each click and read after, so a click
// that completed through a full document load is reported apart from one that
// completed inside the same document. Before the fix that mattered because a
// save could pass by the no-JavaScript path, where the browser follows the 303
// itself, and say nothing about the client router. After the fix the full
// document load IS the path -- ActionBoundary follows the redirect with
// `window.location` -- so `full-load` is the expected outcome and `ok` should
// not occur. Either way, `stuck` is the defect and is the number to read.
//
// After a stall the page is reloaded, because a stalled client router does not
// recover on its own -- which is exactly why the stopgap offers "Reload". The
// database is read around every click, so a stall is proved to be a display
// defect and not a lost save.
import { readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { launch } from "./ui-audit-cdp.mjs";
import { freshCookies } from "./ui-audit-routes.mjs";

const [STATE = "coverage/ui-audit/state.json", LABEL = "before", CLICKS = "25"] = process.argv.slice(2);
// Longer than the 8 s stopgap in SubmitButton: past this the person has been
// told to reload, so the save has not completed on screen by any measure.
const SETTLE_MS = 10000;

const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
const COURSE = state.ids.course;
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// The grant the clicks toggle, read straight from the database.
async function grantedInDb(studentId) {
  const { count } = await service
    .from("content_access")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("resource_type", "course")
    .eq("resource_id", COURSE);
  return (count ?? 0) > 0;
}

// The form the clicks aim at: the first student row carrying an access toggle.
const TOGGLE = `[...document.querySelectorAll('#students form')].find((f) => f.querySelector('input[name="intent"]'))`;

await freshCookies(state);
const b = await launch({ port: 9337, profileRoot: "coverage/c2" });
const results = [];

try {
  await b.viewport(1440, 900);
  await b.setCookies(BASE, state.people.admin.cookie);
  await b.navigate(`${BASE}/admin/courses/${COURSE}`, BASE);

  const studentId = await b.evaluate(
    `(() => { const f = ${TOGGLE}; return f ? f.querySelector('input[name="studentId"]').value : null; })()`,
  );
  if (!studentId) throw new Error(`no access toggle on /admin/courses/${COURSE}`);

  // One round trip answers all three questions: are we still in the same
  // document, is the boundary busy, and what would the next click post.
  const probe = () => b
    .evaluate(`(() => { const f = ${TOGGLE}; return {
      busy: !!document.querySelector('.action-boundary[aria-busy="true"]'),
      button: f ? f.querySelector("button").textContent.replace(/\\s+/g, " ").trim() : null,
      inert: !!document.querySelector(".action-boundary[inert]"),
      intent: f ? f.querySelector('input[name="intent"]').value : null,
      mark: window.__c2mark ?? null,
      pill: f ? (f.closest("tr")?.querySelector(".pill")?.textContent ?? "").trim() : null,
      url: location.search,
    }; })()`)
    .catch(() => ({ busy: false, button: null, inert: false, intent: null, mark: null, pill: null, url: null }));

  for (let i = 1; i <= Number(CLICKS); i += 1) {
    const before = await grantedInDb(studentId);

    // Click the row's toggle, whichever direction it is in.
    const label = await b.evaluate(`(() => {
      window.__c2mark = ${i};
      const f = ${TOGGLE};
      if (!f) return null;
      const button = f.querySelector("button");
      if (!button || button.disabled) return null;
      const text = button.textContent.replace(/\\s+/g, " ").trim();
      button.scrollIntoView({ block: "center" });
      button.click();
      return text;
    })()`);
    if (!label) throw new Error(`click ${i}: no enabled toggle button`);

    const t0 = Date.now();
    // The write the click asked for, confirmed in the database, so "the
    // screen caught up" is measured against what the server actually did.
    let after = before;
    while (Date.now() - t0 < SETTLE_MS && after === before) {
      after = await grantedInDb(studentId);
      if (after === before) await b.sleep(50);
    }
    const wroteAt = Date.now() - t0;

    // Then: does the screen say so, and has the button come back?
    let boundary = false;
    let navigated = false;
    let settled = false;
    let last = null;
    while (Date.now() - t0 < SETTLE_MS) {
      const p = await probe();
      last = p;
      if (p.busy) boundary = true;
      if (p.mark !== i) navigated = true;
      const pending = p.button === "Removing…" || p.button === "Adding…";
      if (!p.busy && !pending && p.intent !== null && (p.intent === "revoke") === after) { settled = true; break; }
      await b.sleep(50);
    }
    const ms = Date.now() - t0;
    const outcome = !settled ? "stuck" : navigated ? "full-load" : "ok";

    results.push({ boundary, click: i, dbGranted: after, end: last, label, ms, outcome, wroteAt, wrote: after !== before });
    console.error(
      `${String(i).padStart(3)} ${label.padEnd(14)} ${outcome.padEnd(9)} screen ${String(ms).padStart(5)}ms  db ${after !== before ? `written @${wroteAt}ms` : "UNCHANGED"}  busy ${last?.busy ? "YES" : "no "} inert ${last?.inert ? "YES" : "no "}  pill "${last?.pill}"  button "${last?.button}"  url "${last?.url}"`,
    );

    // A stuck router does not come back; reload, as the stopgap tells the
    // person to, so the next click starts from a true screen.
    if (!settled) await b.navigate(`${BASE}/admin/courses/${COURSE}`, BASE);
    await b.sleep(150);
  }
} finally {
  writeFileSync(`coverage/c2/c2-${LABEL}.json`, JSON.stringify({ problems: b.problems, results }, null, 2));
  // Console errors, exceptions and failed requests seen across the whole run:
  // a stall with nothing in here is a router defect, not a crash.
  const seen = new Map();
  for (const p of b.problems) seen.set(`${p.kind} ${p.text}`, (seen.get(`${p.kind} ${p.text}`) ?? 0) + 1);
  if (seen.size) {
    console.error(`\nbrowser problems (${b.problems.length}):`);
    for (const [text, n] of [...seen].sort((x, y) => y[1] - x[1]).slice(0, 12)) console.error(`  ${n}x ${text}`);
  } else {
    console.error("\nbrowser problems: none");
  }
  await b.close();
}

const tally = (name) => results.filter((r) => r.outcome === name).length;
const stuck = results.filter((r) => r.outcome === "stuck");
const settled = results
  .filter((r) => r.outcome === "ok")
  .map((r) => r.ms)
  .sort((x, y) => x - y);
const rate = (n) => `${n}/${results.length} = ${Math.round((n / results.length) * 100)}%`;

console.log(`\nC2 reproduction, ${LABEL} -- ${results.length} clicks`);
console.log(`  completed on screen            : ${rate(tally("ok"))}`);
console.log(`  STUCK (C2)                     : ${rate(stuck.length)}`);
console.log(`    of those, boundary engaged   : ${stuck.filter((r) => r.boundary).length} (and never released)`);
console.log(`    of those, boundary never ran : ${stuck.filter((r) => !r.boundary).length} (button left on its pending label)`);
console.log(`  full document load (no-JS path): ${tally("full-load")}`);
console.log(`  writes that did not land       : ${results.filter((r) => !r.wrote).length} of ${results.length}`);
if (settled.length) {
  console.log(`  settle time, median / worst    : ${settled[Math.floor(settled.length / 2)]}ms / ${settled[settled.length - 1]}ms`);
}
writeFileSync(
  `coverage/c2/c2-${LABEL}.summary.json`,
  JSON.stringify({ clicks: results.length, label: LABEL, ok: tally("ok"), stuck: stuck.length }, null, 2),
);
