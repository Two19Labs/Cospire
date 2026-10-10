// Fixture for the UI audit (docs/ui-audit-2026-10-09.md): one admin, one mentor
// and two students in org 1, with enough real data that every signed-in screen
// has something on it -- a programme with a curriculum, documents with real PDF
// bytes, two sectioned mocks (one already sat and scored), an ARS process with
// text, file and form rounds and a submission, and a released mentor report.
//
//   node --env-file=.env.local scripts/verify/ui-audit-fixture.mjs setup    coverage/ui-audit/state.json http://127.0.0.1:3090
//   node --env-file=.env.local scripts/verify/ui-audit-fixture.mjs teardown coverage/ui-audit/state.json
//
// state.json holds live session cookies and the run's password, so it lives
// under coverage/, which is gitignored. Teardown deletes only what state.json
// names, then prints the live counts against the baseline setup recorded.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const [mode, STATE = "coverage/ui-audit/state.json", BASE = "http://127.0.0.1:3090"] = process.argv.slice(2);
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const ORG = 1;
const TABLES = [
  "profiles", "mentor_assignments", "content_access", "courses", "sections", "curriculum_items", "item_progress",
  "documents", "mocks", "mock_sections", "questions", "question_sections", "attempts", "ars_rounds",
  "ars_submissions", "ars_process_runs", "ars_report_templates", "ars_reports", "activity_log",
];

async function counts() {
  const out = {};
  for (const t of TABLES) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  const { data: objects } = await service.storage.from("documents").list(`org/${ORG}`, { limit: 1000 });
  out["storage:documents"] = objects?.length ?? null;
  return out;
}

async function signIn(email, password) {
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (v) => jar.push(...v) } });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "), token: data.session.access_token };
}
const clientFor = (token) => createClient(URL_, PUB, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
function posted(form) {
  const out = [];
  for (const m of form.matchAll(/<input [^>]*>/g)) {
    const type = m[0].match(/type="([^"]*)"/)?.[1] ?? "text";
    const keep = type === "hidden" || ((type === "radio" || type === "checkbox") && /\schecked(=""|\s|\/|>)/.test(m[0])) || (type === "text" && /\svalue="/.test(m[0]));
    const n = m[0].match(/name="([^"]*)"/)?.[1];
    if (keep && n) out.push([decode(n), decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "")]);
  }
  return out;
}

if (mode === "setup") {
  const stamp = Date.now();
  const password = `UiAudit${stamp}x`;
  const state = { base: BASE, baseline: await counts(), made: { courses: [], documents: [], mocks: [], objects: [], questionSections: [], questions: [], reports: [], runs: [], templates: [] }, password, people: {}, stamp };
  mkdirSync(dirname(STATE), { recursive: true });
  const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
  save();
  console.log("baseline", JSON.stringify(state.baseline));

  const people = state.people;
  const names = { admin: "Riya Kapoor", mentor: "Arjun Mehta", student: "Aditya Singhani", student2: "Meera Iyer" };
  for (const [key, role] of [["admin", "admin"], ["mentor", "mentor"], ["student", "student"], ["student2", "student"]]) {
    const email = `ui-audit-${key}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw error;
    people[key] = { email, id: data.user.id, name: names[key] };
    save();
    const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: names[key], org_id: ORG, role });
    if (pe) throw pe;
    Object.assign(people[key], await signIn(email, password));
    save();
  }
  const admin = clientFor(people.admin.token);
  const student = clientFor(people.student.token);
  for (const s of ["student", "student2"]) {
    const { error } = await service.from("mentor_assignments").insert({ assigned_by: people.admin.id, mentor_id: people.mentor.id, org_id: ORG, student_id: people[s].id });
    if (error) throw error;
  }
  const grant = async (studentKey, type, id) => {
    const { error } = await service.from("content_access").insert({ granted_by: people.admin.id, org_id: ORG, resource_id: id, resource_type: type, student_id: people[studentKey].id });
    if (error) throw error;
  };

  // ---- Documents, with real PDF bytes so the viewer has something to draw.
  const pdf = readFileSync(new URL("./sample.pdf", import.meta.url));
  for (const [title, folder] of [["Quant formula sheet", "Quant"], ["Reading comprehension drills", "Verbal"], ["Interview preparation guide", ""]]) {
    const path = `org/${ORG}/${randomUUID()}.pdf`;
    const up = await service.storage.from("documents").upload(path, pdf, { contentType: "application/pdf" });
    if (up.error) throw up.error;
    state.made.objects.push(path);
    const { data, error } = await service.from("documents").insert({ folder, org_id: ORG, storage_path: path, title: `${title} ${stamp}`, uploaded_by: people.admin.id }).select("id").single();
    if (error) throw error;
    state.made.documents.push(data.id);
    save();
  }
  await grant("student", "document", state.made.documents[2]);

  // ---- The bank and two mocks, through the builder's own RPCs.
  const { data: qs, error: qse } = await service.from("question_sections").insert({ name: `Quantitative Aptitude ${stamp}`, org_id: ORG }).select("id").single();
  if (qse) throw qse;
  state.made.questionSections.push(qs.id);
  const base = { p_images: [], p_parent_id: null, p_question_id: null, p_section_id: qs.id, p_solution: "Worked solution.", p_difficulty: "medium", p_topic: "Arithmetic" };
  const q = async (input) => {
    const { data, error } = await admin.rpc("save_question", { ...base, ...input });
    if (error) throw error;
    state.made.questions.push(data);
    save();
    return data;
  };
  const q1 = await q({ p_body: `A train covers 120 km in 2 hours. What is its speed in km/h? (${stamp})`, p_correct_answer: { options: ["b"] }, p_marks: 3, p_options: [{ id: "a", text: "50" }, { id: "b", text: "60" }, { id: "c", text: "70" }, { id: "d", text: "80" }], p_type: "mcq" });
  const q2 = await q({ p_body: `What is 3/4 of 48? (${stamp})`, p_correct_answer: { accepted: ["36"], tolerance: 0 }, p_marks: 3, p_options: [], p_type: "numerical" });
  const q3 = await q({ p_body: `Which of these are prime? (${stamp})`, p_correct_answer: { options: ["a", "c"] }, p_marks: 3, p_options: [{ id: "a", text: "7" }, { id: "b", text: "9" }, { id: "c", text: "11" }, { id: "d", text: "15" }], p_type: "mcq_multi" });
  const passage = await q({ p_body: `The table shows sales of four products over two quarters. (${stamp})`, p_correct_answer: null, p_marks: 0, p_options: [], p_type: "di_stimulus" });
  const child = await q({ p_body: `By how many units did product A grow? (${stamp})`, p_correct_answer: { accepted: ["12"], tolerance: 0 }, p_marks: 3, p_options: [], p_parent_id: passage, p_type: "numerical" });
  // Children first in teardown: they reference the passage.
  state.made.questions = [child, ...state.made.questions.filter((id) => id !== child)];
  const mock = async (title, sections, minutes) => {
    const { data, error } = await admin.rpc("save_mock", {
      p_allow_mobile: true, p_duration_minutes: minutes, p_instructions: "Answer every question. Wrong MCQ answers lose one mark; typed answers carry no penalty.",
      p_max_attempts: 3, p_mock_id: null, p_negative_marking: 1, p_negative_marking_types: ["mcq", "mcq_multi"], p_proctoring_enabled: true,
      p_sections: sections, p_title: `${title} ${stamp}`,
    });
    if (error) throw error;
    state.made.mocks.push(data);
    save();
    return data;
  };
  const mockA = await mock("CAT Mock 1", [
    { durationMinutes: 40, questions: [q1, q2, q3], title: "Quantitative Ability" },
    { durationMinutes: 20, questions: [passage, child], title: "Data Interpretation" },
  ], 60);
  const mockB = await mock("CAT Sectional 1", [{ durationMinutes: null, questions: [q1, q2, q3], title: "Quantitative Ability" }], 40);
  await grant("student", "mock", mockA);
  await grant("student", "mock", mockB);
  await grant("student2", "mock", mockB);

  // ---- A programme with a curriculum: a document, a test and a reading.
  const { data: course, error: ce } = await admin.from("courses").insert({ kind: "programme", org_id: ORG, title: `CAT 2026 Complete ${stamp}` }).select("id").single();
  if (ce) throw ce;
  state.made.courses.push(course.id);
  save();
  const sec = async (title, order) => {
    const { data, error } = await admin.from("sections").insert({ course_id: course.id, org_id: ORG, sort_order: order, title }).select("id").single();
    if (error) throw error;
    return data.id;
  };
  const s1 = await sec("Week 1: Arithmetic", 0);
  const s2 = await sec("Week 2: Data Interpretation", 1);
  for (const row of [
    { section_id: s1, sort_order: 0, title: "How this programme works", body: "Work through each week in order, or jump around: every item is open.", type: "text" },
    { section_id: s1, sort_order: 1, ref_id: state.made.documents[0], type: "document" },
    { section_id: s1, sort_order: 2, ref_id: mockB, type: "test" },
    { section_id: s2, sort_order: 0, ref_id: state.made.documents[1], type: "document" },
    { section_id: s2, sort_order: 1, ref_id: mockA, type: "test" },
  ]) {
    const { error } = await admin.from("curriculum_items").insert({ ...row, org_id: ORG });
    if (error) throw error;
  }
  await grant("student", "course", course.id);

  // ---- An ARS process: text, form and file rounds, granted to both students.
  const { data: ars, error: ae } = await service.from("courses").insert({ kind: "ars_process", org_id: ORG, title: `IIM Ahmedabad ARS ${stamp}` }).select("id").single();
  if (ae) throw ae;
  state.made.courses.push(ars.id);
  save();
  const steps = [{ key: "about", title: "About you", sections: [{ fields: [
    { key: "full_name", label: "Full name", type: "short_text", required: true, prefill: "name" },
    { key: "city", label: "City of residence", type: "short_text", required: true },
    { key: "why", label: "Why this programme?", type: "long_text", required: true, wordLimit: 200 },
  ] }] }];
  const { data: rounds, error: re } = await service.from("ars_rounds").insert([
    { config: { prompt: "In 300 words, describe a decision you would now make differently." }, course_id: ars.id, name: "Written statement", org_id: ORG, requires_review: true, sort_order: 1, submission_mode: "text" },
    { config: { prompt: "Complete the application form.", steps }, course_id: ars.id, name: "Application form", org_id: ORG, requires_review: false, sort_order: 2, submission_mode: "form" },
    { config: { prompt: "Upload a two-minute video essay." }, course_id: ars.id, name: "Video essay", org_id: ORG, requires_review: true, sort_order: 3, submission_mode: "file" },
  ]).select("id, submission_mode");
  if (re) throw re;
  const textRound = rounds.find((r) => r.submission_mode === "text").id;
  await grant("student", "course", ars.id);
  await grant("student2", "course", ars.id);
  const { error: te } = await student.from("ars_submissions").insert({ answer: { response: "I would have asked for help earlier. In my final-year project I spent three weeks on a dead end before speaking to my guide." }, org_id: ORG, round_id: textRound, status: "submitted", student_id: people.student.id });
  if (te) throw te;

  // ---- A report template, and completed runs for both students: the
  // student's report is written and released here; student2's is left for the
  // mentor task flow to write in the browser.
  const { data: template, error: tpe } = await service.from("ars_report_templates").insert({ course_id: ars.id, name: "ARS readiness report", org_id: ORG, overall_levels: ["Developing", "Moderate", "Strong"], readiness_tags: ["Developing", "Ready"] }).select("id").single();
  if (tpe) throw tpe;
  state.made.templates.push(template.id);
  save();
  const { data: comps, error: cpe } = await service.from("ars_report_template_components").insert([
    { metric_names: ["Clarity", "Structure"], org_id: ORG, sort_order: 1, template_id: template.id, title: "Written statement", weightage_pct: 60 },
    { metric_names: ["Presence"], org_id: ORG, sort_order: 2, template_id: template.id, title: "Video essay", weightage_pct: 40 },
  ]).select("id, title");
  if (cpe) throw cpe;
  for (const s of ["student", "student2"]) {
    // A first submission opens the student's run itself, so mark that one
    // complete rather than inserting a second.
    const { data: existing } = await service.from("ars_process_runs").select("id").eq("course_id", ars.id).eq("student_id", people[s].id).maybeSingle();
    const { data: run, error } = existing
      ? await service.from("ars_process_runs").update({ completed_at: new Date().toISOString() }).eq("id", existing.id).select("id").single()
      : await service.from("ars_process_runs").insert({ completed_at: new Date().toISOString(), course_id: ars.id, org_id: ORG, round_order: rounds.map((r) => r.id), student_id: people[s].id }).select("id").single();
    if (error) throw error;
    state.made.runs.push(run.id);
    state[`run_${s}`] = run.id;
    save();
  }
  state.ids = { ars: ars.id, child, course: course.id, mockA, mockB, passage, q1, q2, q3, questionSection: qs.id, rounds: rounds.map((r) => r.id), template: template.id, textRound };
  save();

  const get = async (path, who) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie: people[who].cookie }, redirect: "manual" });
    return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location"), status: r.status };
  };
  const post = async (path, who, form, fields) => {
    const body = new FormData();
    const names = new Set(fields.map(([n]) => n));
    for (const [n, v] of posted(form)) if (!names.has(n)) body.append(n, v);
    for (const [n, v] of fields) body.append(n, String(v));
    const r = await fetch(`${BASE}${path}`, { body, headers: { cookie: people[who].cookie, origin: BASE }, method: "POST", redirect: "manual" });
    await r.text();
    return { location: r.headers.get("location") ?? "", status: r.status };
  };
  const formWith = (html, marker) => {
    const f = forms(html).find((x) => x.includes(marker));
    if (!f) throw new Error(`no form carrying ${marker}`);
    return f;
  };

  // The mentor's report for the student, as ars-report-ui.mjs drives it.
  {
    const queue = await get("/mentor", "mentor");
    const created = await post("/mentor", "mentor", forms(queue.body).find((f) => f.includes('name="runId"') && f.includes(`value="${state.run_student}"`)) ?? formWith(queue.body, 'name="runId"'), [["runId", state.run_student], ["templateId", template.id]]);
    const reportId = Number(created.location.match(/\/mentor\/reports\/(\d+)/)?.[1]);
    if (!reportId) throw new Error(`report not created: ${created.status} ${created.location}`);
    state.made.reports.push(reportId);
    state.ids.report = reportId;
    save();
    for (const c of comps) {
      const editor = await get(`/mentor/reports/${reportId}`, "mentor");
      const form = forms(editor.body).find((f) => f.includes('name="templateComponentId"') && f.includes(`value="${c.id}"`)) ?? formWith(editor.body, 'name="templateComponentId"');
      await post(`/mentor/reports/${reportId}`, "mentor", form, [
        ["templateComponentId", c.id], ["reportId", reportId], ["score", 7], ["strengths", "Clear, specific examples."],
        ["developmentAreas", "Tighten the opening."], ["actionPlan", "Two timed drafts a week."], ["nextStep", "Mock interview"], ["timeline", "30 days"],
        ["readinessTag", "Ready"], ["metricScore_0", 8], ["metricNote_0", "Well organised."], ["metricScore_1", 7], ["metricNote_1", "Logical flow."],
      ]);
    }
    const ready = await get(`/mentor/reports/${reportId}`, "mentor");
    const rel = await post(`/mentor/reports/${reportId}`, "mentor", formWith(ready.body, 'name="closingNote"'), [["closingNote", "A strong start. Keep practising under time."], ["overallLevel", "Moderate"], ["reportId", reportId]]);
    console.log("report", reportId, rel.status, rel.location);
  }

  // ---- Sit mock B to the end, over HTTP, so analytics has a scored attempt.
  {
    const intro = await get(`/student/mocks/${mockB}`, "student");
    const started = await post(`/student/mocks/${mockB}`, "student", formWith(intro.body, 'name="mockId"'), []);
    const attemptId = Number(started.location.match(/\/student\/attempts\/(\d+)/)?.[1]);
    if (!attemptId) throw new Error(`attempt not started: ${started.status} ${started.location}`);
    state.ids.attemptB = attemptId;
    save();
    let screen = await get(`/student/attempts/${attemptId}`, "student");
    await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "b"], ["goto", "2"]]);
    screen = await get(`/student/attempts/${attemptId}?q=2`, "student");
    await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "36"], ["goto", "3"]]);
    screen = await get(`/student/attempts/${attemptId}?q=3`, "student");
    await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "a"], ["intent", "submit"]]);
    const confirm = await get(`/student/attempts/${attemptId}?confirm=submit`, "student");
    await post(`/student/attempts/${attemptId}`, "student", formWith(confirm.body, 'id="submit-form"'), []);
    const { data } = await service.from("attempts").select("status, score").eq("id", attemptId).single();
    console.log("attempt", attemptId, JSON.stringify(data));
  }

  save();
  console.log("fixture ready:", JSON.stringify(state.ids));
} else if (mode === "teardown") {
  if (!existsSync(STATE)) throw new Error(`no state at ${STATE}`);
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const ids = Object.values(state.people ?? {}).map((p) => p.id);
  if (!ids.length) throw new Error("state names no accounts; refusing to tear down");
  const m = state.made;
  let failed = [];
  // Two passes when the first leaves anything: rows the browser flows wrote
  // can reference each other in an order a single pass does not anticipate.
  const pass = async () => {
    const run = async (label, op) => { const { error } = await op; if (error) failed.push(`${label}: ${error.message}`); };
    if (m.reports.length) await run("reports", service.from("ars_reports").delete().in("id", m.reports));
    // Any report written in the browser flow, against this run's process runs.
    if (m.runs.length) await run("flow reports", service.from("ars_reports").delete().in("run_id", m.runs));
    if (m.runs.length) await run("runs", service.from("ars_process_runs").delete().in("id", m.runs));
    for (const c of m.courses) await run("runs by course", service.from("ars_process_runs").delete().eq("course_id", c));
    if (m.templates.length) await run("templates", service.from("ars_report_templates").delete().in("id", m.templates));
    for (const c of m.courses) {
      await run("reports by course", service.from("ars_reports").delete().in("student_id", ids));
      await run("templates by course", service.from("ars_report_templates").delete().eq("course_id", c));
    }
    await run("submissions", service.from("ars_submissions").delete().in("student_id", ids));
    const { data: arsObjects } = await service.storage.from("ars-uploads").list(`org/${ORG}/ars/${state.people.student?.id}`);
    if (arsObjects?.length) await run("ars objects", service.storage.from("ars-uploads").remove(arsObjects.map((o) => `org/${ORG}/ars/${state.people.student.id}/${o.name}`)));
    await run("progress", service.from("item_progress").delete().in("student_id", ids));
    if (m.mocks.length) await run("attempts", service.from("attempts").delete().in("mock_id", m.mocks));
    await run("grants", service.from("content_access").delete().in("student_id", ids));
    // Grants this run's admin made to anyone, and any grant on this run's own
    // mocks, programmes and documents: the browser flows grant through the UI.
    await run("grants made", service.from("content_access").delete().in("granted_by", ids));
    for (const [type, list] of [["mock", m.mocks], ["course", m.courses], ["document", m.documents]]) {
      if (list.length) await run(`grants on ${type}`, service.from("content_access").delete().eq("resource_type", type).in("resource_id", list));
    }
    for (const c of m.courses) await run(`rounds ${c}`, service.from("ars_rounds").delete().eq("course_id", c));
    if (m.courses.length) await run("courses", service.from("courses").delete().in("id", m.courses));
    if (m.mocks.length) await run("mocks", service.from("mocks").delete().in("id", m.mocks));
    if (m.questions.length) await run("rescore events", service.from("rescore_events").delete().in("question_id", m.questions));
    // Children before their passage: parent_id is ON DELETE RESTRICT.
    const { data: kids } = m.questions.length ? await service.from("questions").select("id").in("parent_id", m.questions) : { data: [] };
    const kidIds = new Set((kids ?? []).map((k) => k.id));
    for (const id of [...m.questions.filter((x) => kidIds.has(x)), ...m.questions.filter((x) => !kidIds.has(x))]) {
      await run(`key ${id}`, service.from("question_keys").delete().eq("question_id", id));
      await run(`question ${id}`, service.from("questions").delete().eq("id", id));
    }
    if (m.questionSections.length) await run("question sections", service.from("question_sections").delete().in("id", m.questionSections));
    if (m.documents.length) await run("documents", service.from("documents").delete().in("id", m.documents));
    if (m.objects.length) await run("objects", service.storage.from("documents").remove(m.objects));
    for (const col of ["student_id", "mentor_id", "assigned_by"]) await run(`assignments ${col}`, service.from("mentor_assignments").delete().in(col, ids));
    for (const id of ids) {
      await run(`profile ${id}`, service.from("profiles").delete().eq("id", id));
      await run(`user ${id}`, service.auth.admin.deleteUser(id));
    }

  };
  await pass();
  if (failed.length) { failed = []; await pass(); }
  for (const line of failed) console.log(`cleanup FAILED: ${line}`);
  const after = await counts();
  console.log("baseline", JSON.stringify(state.baseline));
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(state.baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
} else {
  throw new Error("usage: ui-audit-fixture.mjs setup|teardown <state.json> [baseUrl]");
}
