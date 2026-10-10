// Task flows for the UI audit, driven in a real headless Chrome as a person
// would: click by visible text, type into fields, wait for the screen to
// settle. There are no real users, so this is the stand-in for click rate --
// per task, the clicks, the fields typed, the screens passed through, the
// round trips to the app server (documents, RSC navigations and Server Action
// posts; prefetches counted apart) and the wall time.
//
//   node --env-file=.env.local scripts/verify/ui-audit-flows.mjs coverage/ui-audit/state.json <label>
//
// It writes rows the fixture's teardown removes: an attempt on mock A, an ARS
// form submission, a reviewed submission, the second student's report, a user,
// grants, a curriculum section and reading, and a hand-built mock. Run it once
// per fixture: the mock sitting and the user it creates do not repeat.
import { readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { launch } from "./ui-audit-cdp.mjs";
import { freshCookies } from "./ui-audit-routes.mjs";

const [STATE = "coverage/ui-audit/state.json", LABEL = "before"] = process.argv.slice(2);
const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await freshCookies(state);
const b = await launch({ port: 9336 });
await b.viewport(1440, 900);
const results = [];
let flow = null;

async function settle() {
  await b.sleep(120);
  // Settled means something is on screen again: a main region or the exam's
  // form, neither a skeleton nor a redirect in progress. A page left blank
  // after a save -- the defect this audit found -- is NOT settled, and the
  // time it stays blank is counted against the task.
  const t0 = Date.now();
  for (let i = 0; i < 300; i += 1) {
    const ready = await b.evaluate(`!!(document.querySelector("main") || document.querySelector("form[class]")) && !document.querySelector('main[aria-busy="true"], .action-boundary[aria-busy="true"]')`).catch(() => false);
    if (ready) break;
    await b.sleep(50);
  }
  if (flow && Date.now() - t0 > 1500) flow.notes.push(`waited ${Date.now() - t0}ms for content`);
  await b.idle(BASE, 300, 15000);
  const path = await b.evaluate("location.pathname + location.search").catch(() => "");
  if (flow && path && flow.screens[flow.screens.length - 1] !== path.split("?")[0]) flow.screens.push(path.split("?")[0]);
}
async function start(role, name, home) {
  await b.setCookies(BASE, state.people[role].cookie);
  await b.navigate(`${BASE}${home}`, BASE);
  flow = { clicks: 0, fills: 0, name, n0: b.requests.length, notes: [], screens: [home], t0: Date.now() };
}
function finish(ok, note = "") {
  const reqs = b.requests.slice(flow.n0).filter((r) => r.url.startsWith(BASE) && !r.url.includes("/_next/static/") && !r.url.includes("favicon"));
  const prefetch = reqs.filter((r) => r.prefetch).length;
  if (flow.notes.length) note = [note, ...flow.notes].filter(Boolean).join("; ");
  const row = { clicks: flow.clicks, fills: flow.fills, name: flow.name, note, ok, prefetches: prefetch, roundTrips: reqs.length - prefetch, screens: flow.screens.length, path: flow.screens.join(" > "), wallMs: Date.now() - flow.t0 };
  results.push(row);
  console.error(`${ok ? "DONE" : "FAIL"} ${row.name}: ${row.clicks} clicks, ${row.fills} fields, ${row.screens} screens, ${row.roundTrips} round trips (+${prefetch} prefetch), ${(row.wallMs / 1000).toFixed(1)}s${note ? ` -- ${note}` : ""}`);
}
// Click the visible element whose own text matches, preferring links and
// buttons; `within` narrows to an ancestor whose text includes it.
async function click(text, { within = null, exact = true, selector = "a, button, label, summary, [role=button]" } = {}) {
  const ok = await b.evaluate(`(() => {
    const want = ${JSON.stringify(text)}; const scope = ${JSON.stringify(within)};
    const norm = (s) => s.replace(/\\s+/g, " ").trim();
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => (e.offsetParent !== null || e.getClientRects().length) && !e.disabled);
    const hit = els.find((e) => (${exact} ? norm(e.textContent) === want : norm(e.textContent).includes(want)) && (!scope || (() => { for (let p = e.parentElement; p; p = p.parentElement) if (norm(p.textContent).includes(scope) && p.children.length > 1 && p.tagName !== "MAIN" && p.tagName !== "BODY") return true; return false; })()));
    if (!hit) return false; hit.scrollIntoView({ block: "center" }); hit.click(); return true; })()`);
  if (!ok) throw new Error(`nothing to click: "${text}"${within ? ` within "${within}"` : ""}`);
  flow.clicks += 1;
  await settle();
}
async function clickHref(prefix) {
  const ok = await b.evaluate(`(() => { const a = [...document.querySelectorAll('a[href^="${prefix}"]')].find((x) => x.offsetParent !== null); if (!a) return false; a.scrollIntoView({ block: "center" }); a.click(); return true; })()`);
  if (!ok) throw new Error(`no link to ${prefix}`);
  flow.clicks += 1;
  await settle();
}
async function fill(selector, value) {
  const ok = await b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  if (!ok) throw new Error(`no field ${selector}`);
  flow.fills += 1;
}
// ONLY=<regex> runs just the matching tasks, for a rerun after a harness fix.
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
async function attempt(role, name, home, steps) {
  if (only && !only.test(name)) return;
  try { await start(role, name, home); await steps(); finish(true); } catch (error) { finish(false, error.message.slice(0, 160)); await b.screenshot(`coverage/ui-audit/flow-fail-${name.replace(/\W+/g, "-")}.png`).catch(() => {}); }
}
const text = () => b.evaluate("document.querySelector('main')?.innerText ?? document.body.innerText");

try {
  const stamp = state.stamp;
  const ids = state.ids;
  // Each run sits mock A afresh: an attempt left by an earlier run is removed.
  await service.from("attempts").delete().eq("mock_id", ids.mockA).eq("student_id", state.people.student.id);

  // ---------------------------------------------------------------- student
  await attempt("student", "Student: open a programme and work through three items", "/student", async () => {
    await click("Programmes", { selector: ".app-nav a" });
    await clickHref(`/student/programmes/${ids.course}`);
    await click("Read", { within: "How this programme works" });
    await b.evaluate("history.back()"); await settle(); flow.clicks += 1;
    await click("Open", { within: `Quant formula sheet ${stamp}` });
    await b.evaluate("history.back()"); await settle(); flow.clicks += 1;
    await click("View test", { exact: false, within: `CAT Sectional 1 ${stamp}` });
  });
  await attempt("student", "Student: open a document", "/student", async () => {
    await click("Documents", { selector: ".app-nav a" });
    await click(`Interview preparation guide ${stamp}`, { exact: false });
    for (let i = 0; i < 40 && !(await b.evaluate("!!document.querySelector('canvas')")); i += 1) await b.sleep(100);
    if (!(await b.evaluate("!!document.querySelector('canvas')"))) throw new Error("no page drawn");
  });
  await attempt("student", "Student: sit a sectioned mock end to end", "/student", async () => {
    await click("Mock tests", { selector: ".app-nav a" });
    await clickHref(`/student/mocks/${ids.mockA}`);
    await click("Start test", { selector: "button" });
    await click("60", { exact: false, selector: "label" });
    await click("Save and next");
    await fill('input[name="answer"]', "36");
    await click("Mark for review and next");
    await click("7", { exact: false, selector: "label" });
    await click("11", { exact: false, selector: "label" });
    await click("Question 1", { exact: false, selector: "button" }).catch(async () => { await click("1", { selector: "button[name=goto]" }); });
    await click("Next section");
    await click("Leave section");
    await fill('input[name="answer"]', "12");
    await click("Submit test", { selector: "aside button, button" });
    await click("Submit test", { selector: "[role=dialog] button" });
    for (let i = 0; i < 30 && !(await text()).includes("result"); i += 1) await b.sleep(200);
    const t = await text();
    if (!/result/i.test(t)) throw new Error("no result screen");
  });
  await attempt("student", "Student: submit an ARS form round", "/student", async () => {
    await click("ARS", { selector: ".app-nav a" });
    await clickHref(`/student/ars/${ids.rounds[1]}`);
    await fill('input[name="city"]', "Pune");
    await fill('textarea[name="why"]', "Because it pairs analytics with real operating exposure.");
    await click("Hand in", { exact: false, selector: "button" });
    const t = await text();
    if (!/submitted|thank/i.test(t)) flow.notes.push("no plain confirmation text");
  });
  await attempt("student", "Student: read mentor feedback and the report", "/student", async () => {
    await click("Read report");
    if (!(await text()).includes("70/100")) throw new Error("report not shown");
  });

  // ----------------------------------------------------------------- mentor
  await attempt("mentor", "Mentor: review an ARS submission", "/mentor", async () => {
    await click("Review", { within: "Written statement" });
    await click("Mark reviewed");
  });
  await attempt("mentor", "Mentor: write and release a report", "/mentor", async () => {
    await click("Start ARS readiness report", { within: "Meera Iyer" }).catch(() => click("Continue report"));
    for (const index of [0, 1]) {
      // Every visible field of the component's form, filled the way a mentor
      // would: a score, a choice, a sentence. One click to save it.
      const filled = await b.evaluate(`(() => { const f = document.querySelectorAll('form:has(input[name="templateComponentId"])')[${index}]; if (!f) return -1; let n = 0;
        for (const el of f.querySelectorAll("input:not([type=hidden]), textarea, select")) { const p = el.tagName === "SELECT" ? HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(p, "value").set.call(el, el.tagName === "SELECT" ? el.options[el.options.length - 1].value : el.type === "number" ? "7" : "Specific and honest."); el.dispatchEvent(new Event("input", { bubbles: true })); n += 1; }
        f.querySelector("button[type=submit]").click(); return n; })()`);
      if (filled < 0) throw new Error(`no component form ${index}`);
      flow.clicks += 1; flow.fills += filled;
      await settle();
    }
    await fill('textarea[name="closingNote"]', "A good base. Practise under time.");
    await b.evaluate(`(() => { const s = document.querySelector('select[name="overallLevel"]'); if (s) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, s.options[s.options.length - 1].value); s.dispatchEvent(new Event("change", { bubbles: true })); } })()`);
    flow.fills += 1;
    await click("Release", { exact: false, selector: "button" });
    if (!/released/i.test(await text())) throw new Error("not released");
  });

  // ------------------------------------------------------------------ admin
  const newEmail = `ui-audit-flow-${LABEL}-${stamp}@example.com`;
  await attempt("admin", "Admin: create a student and grant a programme", "/admin", async () => {
    await click("Users", { selector: ".app-nav a" });
    await click("Add a user", { exact: false });
    await fill('input[name="name"]', "Kabir Shah");
    await fill('input[name="email"]', newEmail);
    await fill('select[name="role"]', "student");
    await fill('input[name="password"]', `Flow${stamp}abc`);
    await click("Create", { exact: false, selector: "button" });
    await click("Programmes", { selector: ".app-nav a" });
    await clickHref(`/admin/courses/${ids.course}`);
    await click("Grant access", { within: newEmail });
  });
  const { data: made } = await service.from("profiles").select("id").eq("email", newEmail).maybeSingle();
  if (made) { state.people[`flowStudent_${LABEL}`] = { email: newEmail, id: made.id, name: "Kabir Shah", nologin: true }; writeFileSync(STATE, JSON.stringify(state, null, 2)); }

  await attempt("admin", "Admin: build a curriculum (a section and a reading)", "/admin", async () => {
    await click("Programmes", { selector: ".app-nav a" });
    await clickHref(`/admin/courses/${ids.course}`);
    await fill('form:has(button) input[name="title"]', "Week 3: Revision");
    await click("Add section");
    await b.evaluate(`document.querySelectorAll('input[name="title"]').forEach((el, i, all) => { if (i === all.length - 1) el.setAttribute("data-audit", "1"); })`);
    await fill('input[data-audit="1"]', "Revision checklist");
    await fill('textarea[name="body"]', "Redo every wrong answer from week 1.");
    await click("Add reading");
  });
  await attempt("admin", "Admin: build a mock by hand", "/admin", async () => {
    await click("Mock tests", { selector: ".app-nav a" });
    await clickHref("/admin/mocks/new");
    await fill('input[name="title"]', `Hand-built mock ${LABEL} ${stamp}`);
    await b.evaluate(`[...document.querySelectorAll('input[name="questionId"]')].slice(0, 3).forEach((el) => el.click())`);
    flow.clicks += 3;
    await click("Save mock");
  });
  const { data: hand } = await service.from("mocks").select("id").eq("title", `Hand-built mock ${LABEL} ${stamp}`).maybeSingle();
  if (hand) { state.made.mocks.push(hand.id); writeFileSync(STATE, JSON.stringify(state, null, 2)); }

  await attempt("admin", "Admin: grant a mock to a student", "/admin", async () => {
    await click("Mock tests", { selector: ".app-nav a" });
    await clickHref(`/admin/mocks/${ids.mockB}`);
    await click("Grant access", { within: "Kabir Shah" }).catch(() => click("Grant access", { within: "Meera Iyer" }));
  });
  await attempt("admin", "Admin: review attempts and analytics", "/admin", async () => {
    await click("Analytics", { selector: ".app-nav a" });
    await clickHref(`/admin/analytics/mocks/${ids.mockB}`);
    await clickHref("/admin/analytics/attempts/");
  });
  await attempt("admin", "Admin: review ARS submissions and the activity log", "/admin", async () => {
    await click("ARS submissions", { selector: ".app-nav a" });
    await click("Open", { exact: false, within: "Written statement" }).catch(() => click("Aditya Singhani", { exact: false, selector: "a" }));
    await click("Activity log", { selector: ".app-nav a" });
  });
} finally {
  writeFileSync(`coverage/ui-audit/flows-${LABEL}.json`, JSON.stringify(results, null, 2));
  await b.close();
}
console.log("| Task | Done | Clicks | Fields | Screens | Round trips | Wall time |");
console.log("|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.ok ? "yes" : `no: ${r.note}`} | ${r.clicks} | ${r.fills} | ${r.screens} | ${r.roundTrips} | ${(r.wallMs / 1000).toFixed(1)}s |`);
