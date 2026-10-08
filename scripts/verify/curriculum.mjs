// Phase 2 steps 3, 4b and 5 (stream B): proves the curriculum tables, the
// programme-grant cascade (N11) and item_progress against the hosted database,
// as the students themselves -- each check runs through that student's own
// session, so RLS is what answers, not this script.
//
// Needs migration 20261008120000 applied. Self-contained: throwaway accounts,
// its own documents, mock and programme, and cleanup back to the baseline
// counts, which it prints.
//
// node --env-file=.env.local scripts/verify/curriculum.mjs [baseUrl]
//
// With a base URL it also drives the student's programme page over HTTP.

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? null;
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `CurriculumVerify${stamp}x`;
const people = {};
const made = { courses: [], documents: [], mocks: [], questions: [], questionSections: [] };
let passes = 0;
let failures = 0;

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (pass) passes += 1;
  else failures += 1;
}

async function person(key, role) {
  const email = `curriculum-verify-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  people[key] = { id: data.user.id };
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Curriculum ${key}`, org_id: 1, role });
  if (pe) throw pe;
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (v) => jar.push(...v) } });
  const { data: session, error: se } = await ssr.auth.signInWithPassword({ email, password });
  if (se) throw se;
  people[key].cookie = jar.map((c) => `${c.name}=${c.value}`).join("; ");
  people[key].client = createClient(URL_, PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
}

const tables = ["courses", "sections", "curriculum_items", "item_progress", "content_access", "documents", "mocks", "questions", "question_sections", "profiles"];
async function counts() {
  const out = {};
  for (const t of tables) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  return out;
}

async function visible(key, table, id) {
  const { data, error } = await people[key].client.from(table).select("id").eq("id", id);
  if (error) return `error ${error.code}`;
  return data.length;
}

async function document(title) {
  const { data, error } = await service.from("documents").insert({
    folder: "", org_id: 1, storage_path: `org/1/${randomUUID()}.pdf`, title: `${title} ${stamp}`, uploaded_by: people.admin.id,
  }).select("id").single();
  if (error) throw error;
  made.documents.push(data.id);
  return data.id;
}

const baseline = await counts();
console.log("baseline", JSON.stringify(baseline));

try {
  await person("admin", "admin");
  await person("s1", "student");
  await person("s2", "student");
  const admin = people.admin.client;

  // Fixtures: two documents, one mock (through the builder's own RPCs), and a
  // programme holding D1, the mock and a reading. D2 is outside it.
  const D1 = await document("Curriculum doc in programme");
  const D2 = await document("Curriculum doc outside");

  const { data: qs, error: qse } = await service.from("question_sections").insert({ name: `Curr QA ${stamp}`, org_id: 1 }).select("id").single();
  if (qse) throw qse;
  made.questionSections.push(qs.id);
  const { data: q, error: qe } = await admin.rpc("save_question", {
    p_body: `Curr q ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "easy", p_images: [], p_marks: 3,
    p_options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], p_parent_id: null, p_question_id: null,
    p_section_id: qs.id, p_solution: null, p_topic: `Curr ${stamp}`, p_type: "mcq",
  });
  if (qe) throw qe;
  made.questions.push(q);
  const { data: M, error: me } = await admin.rpc("save_mock", {
    p_allow_mobile: true, p_duration_minutes: 30, p_instructions: "Curriculum fixture.", p_max_attempts: 1, p_mock_id: null,
    p_negative_marking: 0, p_negative_marking_types: ["mcq", "mcq_multi"], p_proctoring_enabled: false,
    p_sections: [{ durationMinutes: null, questions: [q], title: "All" }], p_title: `Curr mock ${stamp}`,
  });
  if (me) throw me;
  made.mocks.push(M);

  // ---- The builder's writes, as the admin.
  const { data: course, error: ce } = await admin.from("courses").insert({ kind: "programme", org_id: 1, title: `Curr programme ${stamp}` }).select("id").single();
  if (ce) throw ce;
  made.courses.push(course.id);
  const { data: section, error: sece } = await admin.from("sections").insert({ course_id: course.id, org_id: 1, title: "Week 1" }).select("id").single();
  check("admin creates a section on a programme", !sece, sece?.message);
  const items = {};
  for (const [key, row] of [
    ["doc", { ref_id: D1, sort_order: 0, type: "document" }],
    ["test", { ref_id: M, sort_order: 1, type: "test" }],
    ["text", { body: "Read this.", sort_order: 2, title: "Intro", type: "text" }],
  ]) {
    const { data, error } = await admin.from("curriculum_items").insert({ ...row, org_id: 1, section_id: section.id }).select("id").single();
    check(`admin adds a ${row.type} item`, !error, error?.message);
    items[key] = data?.id;
  }
  {
    const { error } = await admin.from("curriculum_items").insert({ org_id: 1, ref_id: 1, section_id: section.id, type: "video" });
    check("a video item is refused until the video library exists", Boolean(error));
  }
  {
    const { error } = await admin.from("curriculum_items").insert({ org_id: 1, ref_id: 999999999, section_id: section.id, type: "document" });
    check("an item naming a document that does not exist is refused", Boolean(error));
  }
  {
    const { data: ars, error } = await admin.from("courses").insert({ kind: "ars_process", org_id: 1, title: `Curr ARS ${stamp}` }).select("id").single();
    if (error) throw error;
    made.courses.push(ars.id);
    const { error: se } = await admin.from("sections").insert({ course_id: ars.id, org_id: 1, title: "Nope" });
    check("a section on an ARS process is refused", Boolean(se));
  }

  // ---- Before any grant: nothing.
  check("no grant: s1 cannot read D1", (await visible("s1", "documents", D1)) === 0);
  check("no grant: s1 cannot read the mock", (await visible("s1", "mocks", M)) === 0);

  // ---- Grant s1 the programme: the cascade.
  {
    const { error } = await admin.from("content_access").insert({ granted_by: people.admin.id, org_id: 1, resource_id: course.id, resource_type: "course", student_id: people.s1.id });
    if (error) throw error;
  }
  check("cascade: s1 reads the programme's document", (await visible("s1", "documents", D1)) === 1);
  check("cascade: s1 reads the programme's mock", (await visible("s1", "mocks", M)) === 1);
  {
    const { data } = await people.s1.client.from("mock_sections").select("id").eq("mock_id", M);
    check("cascade: s1 reads the mock's sections", (data ?? []).length === 1);
  }
  check("cascade: s1 reads the section", (await visible("s1", "sections", section.id)) === 1);
  check("cascade: s1 reads the reading item", (await visible("s1", "curriculum_items", items.text)) === 1);
  check("cascade does not reach outside the programme: s1 cannot read D2", (await visible("s1", "documents", D2)) === 0);

  // ---- The wrong student.
  check("wrong student: s2 cannot read D1", (await visible("s2", "documents", D1)) === 0);
  check("wrong student: s2 cannot read the mock", (await visible("s2", "mocks", M)) === 0);
  check("wrong student: s2 cannot read the curriculum", (await visible("s2", "curriculum_items", items.doc)) === 0);

  // ---- An item grant with no programme grant still works on its own.
  {
    const { error } = await admin.from("content_access").insert({ granted_by: people.admin.id, org_id: 1, resource_id: D2, resource_type: "document", student_id: people.s2.id });
    if (error) throw error;
  }
  check("override: s2 reads D2 through an item grant alone", (await visible("s2", "documents", D2)) === 1);
  check("override: an item grant opens nothing else", (await visible("s2", "documents", D1)) === 0);

  // ---- item_progress writes.
  const progress = (key, item, studentKey = key) => people[key].client.from("item_progress").insert({
    completed: true, completed_at: new Date().toISOString(), item_id: item, org_id: 1, percent: 100, student_id: people[studentKey].id,
  });
  check("s1 records their own progress on the document item", !(await progress("s1", items.doc)).error);
  check("s1 records their own progress on the reading", !(await progress("s1", items.text)).error);
  check("a test item's progress cannot be stored (it is derived)", Boolean((await progress("s1", items.test)).error));
  check("s2 cannot write a row carrying s1's student_id", Boolean((await progress("s2", items.text, "s1")).error));
  check("s2 cannot record progress on a programme they do not hold", Boolean((await progress("s2", items.text)).error));
  {
    const { data } = await people.s2.client.from("item_progress").update({ percent: 1 }).eq("student_id", people.s1.id).select("item_id");
    check("s2 cannot update s1's progress", (data ?? []).length === 0);
    const { data: own } = await people.s2.client.from("item_progress").select("item_id").eq("student_id", people.s1.id);
    check("s2 cannot read s1's progress", (own ?? []).length === 0);
  }

  // ---- HTTP, when a running app is given.
  if (BASE) {
    const page = async (key) => fetch(`${BASE}/student/programmes/${course.id}`, { headers: { cookie: people[key].cookie }, redirect: "manual" });
    const mine = await page("s1");
    const body = await mine.text();
    check("app: s1's programme page renders the curriculum", mine.status === 200 && body.includes("Week 1") && body.includes("Intro"));
    check("app: s2 gets a 404 for a programme they do not hold", (await page("s2")).status === 404);
  }

  // ---- A disabled student reads nothing.
  await service.from("profiles").update({ status: "disabled" }).eq("id", people.s1.id).throwOnError();
  check("disabled: s1 cannot read D1", (await visible("s1", "documents", D1)) === 0);
  await service.from("profiles").update({ status: "active" }).eq("id", people.s1.id).throwOnError();

  // ---- Revoking the programme grant closes the cascade.
  {
    const { data } = await admin.from("content_access").delete().eq("resource_type", "course").eq("resource_id", course.id).eq("student_id", people.s1.id).select("id");
    check("admin revokes the programme grant", (data ?? []).length === 1);
  }
  check("revoked: s1 cannot read D1", (await visible("s1", "documents", D1)) === 0);
  check("revoked: s1 cannot read the mock", (await visible("s1", "mocks", M)) === 0);
  check("revoked: s1 cannot read the curriculum", (await visible("s1", "sections", section.id)) === 0);
  check("revoked: s2's override is untouched", (await visible("s2", "documents", D2)) === 1);

  console.log(`\n${passes} passed, ${failures} failed`);
} finally {
  const failed = [];
  const attempt = async (label, run) => {
    const { error } = await run();
    if (error) failed.push(`${label}: ${error.message}`);
  };
  const ids = Object.values(people).map((p) => p.id);
  if (ids.length) {
    await attempt("progress", () => service.from("item_progress").delete().in("student_id", ids));
    await attempt("grants", () => service.from("content_access").delete().in("student_id", ids));
  }
  // Deleting a course cascades its sections and items.
  if (made.courses.length) await attempt("courses", () => service.from("courses").delete().in("id", made.courses));
  if (made.mocks.length) await attempt("mocks", () => service.from("mocks").delete().in("id", made.mocks));
  for (const id of made.questions) {
    await attempt(`key ${id}`, () => service.from("question_keys").delete().eq("question_id", id));
    await attempt(`question ${id}`, () => service.from("questions").delete().eq("id", id));
  }
  if (made.questionSections.length) await attempt("question sections", () => service.from("question_sections").delete().in("id", made.questionSections));
  if (made.documents.length) await attempt("documents", () => service.from("documents").delete().in("id", made.documents));
  for (const [key, p] of Object.entries(people)) {
    await attempt(`profile ${key}`, () => service.from("profiles").delete().eq("id", p.id));
    const { error } = await service.auth.admin.deleteUser(p.id);
    if (error) failed.push(`user ${key}: ${error.message}`);
  }
  for (const line of failed) console.log(`cleanup FAILED: ${line}`);
  const after = await counts();
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
  if (failures) process.exitCode = 1;
}
