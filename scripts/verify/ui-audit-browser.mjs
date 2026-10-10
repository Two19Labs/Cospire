// The real-browser half of the UI audit. Against a running production build
// and the fixture from ui-audit-fixture.mjs:
//
//   1. every signed-in screen of every role, loaded directly: navigation
//      timing, LCP, layout shift, console errors and failed requests, a few
//      accessibility basics, horizontal overflow at phone width, and
//      screenshots at 1440px and 390px;
//   2. clicks: from each role's home, every nav item and a detail link in
//      turn, as client navigations -- time to a skeleton, time to content, and
//      whether the heading, breadcrumb and nav highlight ever showed something
//      other than where the click was going.
//
//   node --env-file=.env.local scripts/verify/ui-audit-browser.mjs coverage/ui-audit/state.json <label> [screens|clicks|all]
//
// Screenshots go to coverage/ui-audit/<label>/ (gitignored, never committed).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { launch } from "./ui-audit-cdp.mjs";
import { buildRoutes, freshCookies } from "./ui-audit-routes.mjs";

const [STATE = "coverage/ui-audit/state.json", LABEL = "before", WHAT = "all"] = process.argv.slice(2);
const state = JSON.parse(readFileSync(STATE, "utf8"));
const BASE = state.base;
const OUT = `coverage/ui-audit/${LABEL}`;
mkdirSync(OUT, { recursive: true });
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
await freshCookies(state);
const routes = await buildRoutes(state, service);
const who = { admin: "admin", mentor: "mentor", student: "student" };

// Accessibility basics a script can judge: unlabelled controls, images without
// alt, buttons and links without a name, landmarks, one h1, skipped heading
// levels, duplicate ids, and anything wider than the window.
const A11Y = String.raw`(() => {
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || el.value || "").trim();
  const out = [];
  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
  for (const el of document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")) {
    if (!visible(el)) continue;
    const labelled = el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
    if (!labelled) out.push("unlabelled " + el.tagName.toLowerCase() + (el.name ? "[name=" + el.name + "]" : ""));
  }
  for (const el of document.querySelectorAll("img:not([alt])")) out.push("img without alt " + (el.src || "").slice(-40));
  for (const el of document.querySelectorAll("button, a[href]")) if (visible(el) && !name(el) && !el.querySelector("img[alt]:not([alt=''])")) out.push("nameless " + el.tagName.toLowerCase() + " " + (el.getAttribute("href") || el.className).slice(0, 40));
  if (!document.querySelector("main")) out.push("no main landmark");
  const h1s = document.querySelectorAll("h1").length;
  if (h1s !== 1) out.push(h1s + " h1 elements");
  let prev = 0;
  for (const h of document.querySelectorAll("main h1, main h2, main h3, main h4")) { const lv = +h.tagName[1]; if (prev && lv > prev + 1) out.push("heading jumps h" + prev + " to h" + lv + ": " + h.textContent.trim().slice(0, 30)); prev = lv; }
  const ids = {};
  for (const el of document.querySelectorAll("[id]")) ids[el.id] = (ids[el.id] || 0) + 1;
  for (const [id, n] of Object.entries(ids)) if (n > 1) out.push("duplicate id " + id);
  const overflow = document.documentElement.scrollWidth - window.innerWidth;
  const wide = overflow > 1 ? [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((el) => el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0]) : [];
  return { issues: [...new Set(out)], overflow, wide, h1: document.querySelector("h1")?.textContent?.trim() ?? "" };
})()`;

const b = await launch();
const report = { clicks: [], screens: [] };
try {
  if (WHAT === "all" || WHAT === "screens") {
    for (const [role, paths] of Object.entries(routes)) {
      await b.setCookies(BASE, state.people[who[role]].cookie);
      for (const path of paths) {
        await b.viewport(1440, 900);
        const before = b.problems.length;
        const nav = await b.navigate(`${BASE}${path}`, BASE);
        const desk = await b.evaluate(A11Y);
        const slug = `${role}${path.replace(/[^a-z0-9]+/gi, "-")}`.replace(/-$/, "");
        await b.screenshot(`${OUT}/${slug}-1440.png`);
        await b.viewport(390, 844, true);
        await b.sleep(400);
        const phone = await b.evaluate(A11Y);
        await b.screenshot(`${OUT}/${slug}-390.png`);
        const problems = b.problems.slice(before);
        report.screens.push({ a11y: desk.issues, h1: desk.h1, nav, path, phoneOverflow: phone.overflow, phoneWide: phone.wide, problems, role });
        console.error(`${role.padEnd(7)} ${path.slice(0, 50).padEnd(50)} ttfb ${nav.ttfb} dcl ${nav.dcl} lcp ${nav.lcp} cls ${nav.cls} phone+${phone.overflow}px a11y ${desk.issues.length} problems ${problems.length}`);
      }
    }
  }

  if (WHAT === "all" || WHAT === "clicks") {
    await b.viewport(1440, 900);
    // From each role's home, every nav item in turn, then into a record.
    const plans = {
      admin: { home: "/admin", details: [["/admin/courses", `/admin/courses/${state.ids.course}`], ["/admin/mocks", `/admin/mocks/${state.ids.mockB}`], ["/admin/ars", `/admin/ars/${state.ids.ars}`], ["/admin/questions", `/admin/questions/${state.ids.q1}`], ["/admin/users", "/admin/users/new"], ["/admin/analytics", `/admin/analytics/mocks/${state.ids.mockB}`]] },
      mentor: { home: "/mentor", details: [["/mentor", `/mentor/reports/${state.ids.report}`], ["/mentor/analytics", `/mentor/analytics/attempts/${state.ids.attemptB}`]] },
      student: { home: "/student", details: [["/student/programmes", `/student/programmes/${state.ids.course}`], ["/student/mocks", `/student/mocks/${state.ids.mockA}`], ["/student/ars", `/student/ars/${state.ids.rounds[1]}`], ["/student/analytics", `/student/analytics/attempts/${state.ids.attemptB}`]] },
    };
    for (const [role, plan] of Object.entries(plans)) {
      await b.setCookies(BASE, state.people[who[role]].cookie);
      await b.navigate(`${BASE}${plan.home}`, BASE);
      const navs = await b.evaluate(`[...document.querySelectorAll(".app-nav a")].map((a) => a.getAttribute("href"))`);
      const clickTo = async (href, from) => {
        await b.sleep(1200); // let prefetches settle, as a person would take a moment
        const found = await b.evaluate(`(() => { const a = [...document.querySelectorAll('a[href="${href}"]')].find((x) => x.offsetParent !== null) ?? document.querySelector('a[href="${href}"]'); if (!a) return false; __audit.track(); a.click(); return true; })()`);
        if (!found) { report.clicks.push({ from, href, missing: true, role }); console.error(`${role} ${from} -> ${href}: NO LINK`); return; }
        const start = Date.now();
        let tl = [];
        while (Date.now() - start < 10000) {
          await b.sleep(40);
          tl = await b.evaluate("__audit.timeline");
          const lastS = tl[tl.length - 1];
          if (lastS && lastS.path.split("?")[0] === href && !lastS.busy && lastS.h1 && Date.now() - start > 300) break;
        }
        await b.idle(BASE, 250, 4000);
        tl = await b.evaluate("__audit.timeline");
        const cls = await b.evaluate("__audit.clsSince");
        const final = tl[tl.length - 1] ?? {};
        const skeleton = tl.find((s) => s.busy);
        const content = tl.find((s) => s.path.split("?")[0] === href && !s.busy && s.h1 === final.h1);
        // Anything shown between the click and the content that names a
        // different place: a heading or breadcrumb that is neither the old
        // screen's, nor blank (shimmer), nor the final one.
        const first = tl[0] ?? {};
        const wrong = tl.filter((s) => s !== first && s !== final && ((s.h1 && s.h1 !== final.h1 && s.h1 !== first.h1) || (s.crumb && s.crumb !== final.crumb && s.crumb !== first.crumb) || (s.nav && s.nav !== final.nav && s.nav !== first.nav)));
        const navLate = tl.find((s) => s.nav === final.nav);
        const row = {
          cls: +cls.toFixed(4), contentMs: content?.t ?? null, finalCrumb: final.crumb, finalH1: final.h1, finalNav: final.nav, from, href,
          navHighlightMs: navLate?.t ?? null, role, skeletonMs: skeleton?.t ?? null, states: tl.length, wrong: wrong.map((s) => `${s.t}ms h1="${s.h1}" crumb="${s.crumb}" nav=${s.nav} busy=${s.busy}`),
        };
        report.clicks.push(row);
        console.error(`${role.padEnd(7)} ${from.slice(0, 34).padEnd(34)} -> ${href.slice(0, 40).padEnd(40)} skeleton ${row.skeletonMs} content ${row.contentMs} nav ${row.navHighlightMs} cls ${row.cls} wrong ${wrong.length}`);
      };
      let here = plan.home;
      for (const href of navs) { if (href === here) continue; await clickTo(href, here); here = href; }
      for (const [list, detail] of plan.details) {
        if (here !== list) { await clickTo(list, here); here = list; }
        await clickTo(detail, here);
        here = detail;
      }
    }
  }
} finally {
  writeFileSync(`coverage/ui-audit/browser-${LABEL}${WHAT === "all" ? "" : `-${WHAT}`}.json`, JSON.stringify(report, null, 2));
  await b.close();
}
