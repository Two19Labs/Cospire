// Analytics end to end, over HTTP, with real session cookies. Two students sit
// two mocks through the real application (start and submit are the app's own
// form posts, so scoring is the app's), answers are written through each
// student's own session, and every analytics screen is then read and its
// numbers compared with values worked out by hand below. Then the refusals:
// another student, an unassigned mentor and another organisation's admin see
// none of it. Throwaway accounts only; everything is deleted at the end and the
// live counts are printed against the baseline.
//
//   node --env-file=.env.local scripts/verify/analytics.mjs http://127.0.0.1:3060
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3060";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `AnVerify${stamp}x`;
const people = {};
const made = { mocks: [], org: null, questions: [], sections: [] };
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
let passes = 0;
let failures = 0;

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (pass) passes += 1;
  else failures += 1;
}
async function signIn(email) {
  const jar = [];
  const ssr = createServerClient(URL, PUB, { cookies: { getAll: () => [], setAll: (v) => jar.push(...v) } });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const client = createClient(URL, PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  return { client, cookie: jar.map((c) => `${c.name}=${c.value}`).join("; ") };
}
async function person(key, role, orgId = 1) {
  const email = `an-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  people[key] = { id: data.user.id };
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Analytics ${key} ${stamp}`, org_id: orgId, role });
  if (pe) throw pe;
  Object.assign(people[key], await signIn(email));
}
async function get(path, key, ua) {
  const headers = {};
  if (key) headers.cookie = people[key].cookie;
  if (ua) headers["user-agent"] = ua;
  const r = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location"), status: r.status };
}
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
function hidden(form) {
  const out = [];
  for (const m of form.matchAll(/<input [^>]*>/g)) {
    if ((m[0].match(/type="([^"]*)"/)?.[1] ?? "text") !== "hidden") continue;
    const n = m[0].match(/name="([^"]*)"/)?.[1];
    if (n) out.push([decode(n), decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "")]);
  }
  return out;
}
async function post(path, key, form, ua) {
  const body = new FormData();
  for (const [n, v] of hidden(form)) body.append(n, v);
  const headers = { cookie: people[key].cookie, origin: BASE };
  if (ua) headers["user-agent"] = ua;
  const r = await fetch(`${BASE}${path}`, { body, headers, method: "POST", redirect: "manual" });
  return { location: r.headers.get("location"), status: r.status };
}
function formWith(html, marker) {
  const form = forms(html).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form carrying ${marker}`);
  return form;
}
const isNotFound = (page) => page.body.includes("Page not found");
// The text of each cell in the table row whose first cell reads `label`.
function row(html, label) {
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => decode(c[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim());
    if (cells[0] === label) return cells;
  }
  return null;
}
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
function checkRow(name, html, label, expected) {
  const actual = row(html, label);
  check(name, same(actual, expected), same(actual, expected) ? "" : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
const stat = (html, value, label) => html.includes(`<strong>${value}</strong>${label}`);

async function saveQuestion(input) {
  const { data, error } = await people.admin.client.rpc("save_question", input);
  if (error) throw error;
  made.questions.push(data);
  return data;
}
async function saveMock(title, sections, maxAttempts) {
  const { data, error } = await people.admin.client.rpc("save_mock", {
    p_allow_mobile: true, p_duration_minutes: 30, p_instructions: "Analytics fixture.",
    p_max_attempts: maxAttempts, p_mock_id: null, p_negative_marking: 1,
    p_negative_marking_types: ["mcq", "mcq_multi"], p_proctoring_enabled: false, p_sections: sections, p_title: `${title} ${stamp}`,
  });
  if (error) throw error;
  made.mocks.push(data);
  return data;
}
// Start through the app, answer through the student's own session, submit
// through the app so the app scores it. Returns the attempt id.
async function sit(key, mock, answers, ua) {
  const intro = await get(`/student/mocks/${mock}`, key, ua);
  const started = await post(`/student/mocks/${mock}`, key, formWith(intro.body, 'name="mockId"'), ua);
  const id = Number(new globalThis.URL(started.location ?? "/", BASE).pathname.match(/\/student\/attempts\/(\d+)/)?.[1]);
  if (!Number.isInteger(id)) throw new Error(`could not start mock ${mock}: ${started.status} ${started.location}`);
  if (answers.length) {
    const { error } = await people[key].client.from("attempt_responses").insert(answers.map(([question_id, answer]) => ({ answer, attempt_id: id, question_id })));
    if (error) throw error;
  }
  const confirm = await get(`/student/attempts/${id}?confirm=submit`, key, ua);
  await post(`/student/attempts/${id}`, key, formWith(confirm.body, 'id="submit-form"'), ua);
  return id;
}
async function counts() {
  const tables = ["attempts", "attempt_responses", "mocks", "questions", "question_sections", "content_access", "mentor_assignments", "profiles", "orgs"];
  const out = {};
  for (const t of tables) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  return out;
}
const baseline = await counts();
console.log("baseline", JSON.stringify(baseline));

try {
  await person("admin", "admin");
  await person("s1", "student");
  await person("s2", "student");
  await person("mentor", "mentor");
  await person("stranger", "mentor");
  {
    const { data: other } = await service.from("orgs").select("id").neq("id", 1).limit(1);
    let orgId = other?.[0]?.id;
    if (!orgId) {
      const { data, error } = await service.from("orgs").insert({ name: `Analytics rival ${stamp}` }).select("id").single();
      if (error) throw error;
      orgId = made.org = data.id;
    }
    await person("rival", "admin", orgId);
  }
  {
    const { error } = await service.from("mentor_assignments").insert({ assigned_by: people.admin.id, mentor_id: people.mentor.id, org_id: 1, student_id: people.s1.id });
    if (error) throw error;
  }

  // ---- The bank: two sections, three topics, three difficulties, 3 marks each.
  const sections = {};
  for (const name of ["QA", "VA"]) {
    const { data, error } = await service.from("question_sections").insert({ name: `An ${name} ${stamp}`, org_id: 1 }).select("id").single();
    if (error) throw error;
    made.sections.push(data.id);
    sections[name] = data.id;
  }
  const base = { p_images: [], p_parent_id: null, p_question_id: null, p_solution: null, p_marks: 3 };
  const mcq = [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }];
  const q1 = await saveQuestion({ ...base, p_body: `An q1 ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "easy", p_options: mcq, p_section_id: sections.QA, p_topic: `Algebra ${stamp}`, p_type: "mcq" });
  const q2 = await saveQuestion({ ...base, p_body: `An q2 ${stamp}`, p_correct_answer: { accepted: ["1/2"], tolerance: 0 }, p_difficulty: "hard", p_options: [], p_section_id: sections.QA, p_topic: `Algebra ${stamp}`, p_type: "numerical" });
  const q3 = await saveQuestion({ ...base, p_body: `An q3 ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "medium", p_options: mcq, p_section_id: sections.VA, p_topic: `Reading ${stamp}`, p_type: "mcq" });
  const passage = await saveQuestion({ ...base, p_body: `An passage ${stamp}`, p_correct_answer: null, p_difficulty: "medium", p_marks: 0, p_options: [], p_section_id: sections.VA, p_topic: `Tables ${stamp}`, p_type: "di_stimulus" });
  const child = await saveQuestion({ ...base, p_body: `An child ${stamp}`, p_correct_answer: { accepted: ["7"], tolerance: 0 }, p_difficulty: "medium", p_options: [], p_parent_id: passage, p_section_id: sections.VA, p_topic: `Tables ${stamp}`, p_type: "numerical" });
  made.questions.sort((a, b) => (a === child ? -1 : b === child ? 1 : 0));
  const T = { algebra: `Algebra ${stamp}`, reading: `Reading ${stamp}`, tables: `Tables ${stamp}`, qa: `An QA ${stamp}`, va: `An VA ${stamp}` };

  // Mock M: 4 answerable questions, 12 marks, MCQ penalty 1. Mock N: q1 alone.
  const M = await saveMock("An main", [{ durationMinutes: null, questions: [q1, q2, q3, passage, child], title: "All questions" }], 2);
  const N = await saveMock("An short", [{ durationMinutes: null, questions: [q1], title: "All questions" }], 1);
  const titleM = `An main ${stamp}`;
  const titleN = `An short ${stamp}`;
  for (const [student, mock] of [["s1", M], ["s1", N], ["s2", M]]) {
    const { error } = await people.admin.client.from("content_access").insert({ granted_by: people.admin.id, org_id: 1, resource_id: mock, resource_type: "mock", student_id: people[student].id });
    if (error) throw error;
  }

  // Worked by hand:
  //   A1 (s1, M): q1 a +3, q2 .5 +3, q3 b -1, child blank     = 5
  //   A2 (s1, M): q1 b -1, q3 a +3, q2 and child never opened = 2
  //   B1 (s2, M, phone): all four right                        = 12
  //   N1 (s1, N): q1 a                                         = 3
  const A1 = await sit("s1", M, [[q1, { options: ["a"] }], [q2, { value: ".5" }], [q3, { options: ["b"] }], [child, null]]);
  const A2 = await sit("s1", M, [[q1, { options: ["b"] }], [q3, { options: ["a"] }]]);
  const B1 = await sit("s2", M, [[q1, { options: ["a"] }], [q2, { value: "0.50" }], [q3, { options: ["a"] }], [child, { value: "7" }]], PHONE);
  const N1 = await sit("s1", N, [[q1, { options: ["a"] }]]);
  const { data: scored } = await service.from("attempts").select("id, score, status, proctored").in("id", [A1, A2, B1, N1]).order("id");
  check("the fixtures were submitted and scored by the app as worked by hand (5, 2, 12, 3), the phone one unproctored",
    same(scored.map((r) => [Number(r.score), r.status, r.proctored]), [[5, "submitted", true], [2, "submitted", true], [12, "submitted", false], [3, "submitted", true]]),
    JSON.stringify(scored));

  // ---- The student's own attempt breakdown.
  {
    const page = await get(`/student/analytics/attempts/${A1}`, "s1");
    check("student: A1 renders with its title, score 5 of 12 and the summary", page.status === 200 && page.body.includes(titleM) && stat(page.body, "5", "score out of 12") && stat(page.body, "3", "attempted") && stat(page.body, "2", "correct") && stat(page.body, "1", "wrong") && stat(page.body, "1", "not answered") && stat(page.body, "67%", "accuracy"));
    checkRow("student: A1 by section, QA", page.body, T.qa, [T.qa, "2", "2", "0", "0", "100%", "6 / 6"]);
    checkRow("student: A1 by section, VA", page.body, T.va, [T.va, "2", "0", "1", "1", "0%", "-1 / 6"]);
    checkRow("student: A1 by topic, Algebra", page.body, T.algebra, [T.algebra, "2", "2", "0", "0", "100%", "6 / 6"]);
    checkRow("student: A1 by topic, Tables (nothing attempted shows a dash)", page.body, T.tables, [T.tables, "1", "0", "0", "1", "—", "0 / 3"]);
    checkRow("student: A1 by difficulty, medium", page.body, "medium", ["medium", "2", "0", "1", "1", "0%", "-1 / 6"]);
    checkRow("student: A1 by difficulty, easy", page.body, "easy", ["easy", "1", "1", "0", "0", "100%", "3 / 3"]);
    check("student: no question body, option or key is on the analytics page", !page.body.includes(`An q1 ${stamp}`) && !page.body.includes("Alpha"));
  }

  // ---- The student's overview.
  {
    const page = await get("/student/analytics", "s1");
    check("student overview: 3 mocks submitted, 6 attempted, 4 correct, 67% accuracy", page.status === 200 && stat(page.body, "3", "mocks submitted") && stat(page.body, "6", "questions attempted") && stat(page.body, "4", "correct") && stat(page.body, "67%", "overall accuracy"));
    checkRow("student overview: trend, M first attempt 5 / 12 = 42%", page.body, titleM, [titleM, "1", row(page.body, titleM)?.[2], "5 / 12", "42%", "Breakdown"]);
    check("student overview: trend, M second attempt 2 / 12 = 17%, and N 3 / 3 = 100%", page.body.includes("2 / 12") && page.body.includes("17%") && same(row(page.body, titleN)?.slice(3, 5), ["3 / 3", "100%"]));
    const weakest = [...page.body.matchAll(new RegExp(`<td[^>]*>((?:Algebra|Reading|Tables) ${stamp})</td>`, "g"))].map((m) => m[1]);
    check("student overview: weakest topics, Tables (0 of 2), then Reading (1 of 2), then Algebra (3 of 5)", same(weakest, [T.tables, T.reading, T.algebra]), JSON.stringify(weakest));
    checkRow("student overview: Algebra across mocks", page.body, T.algebra, [T.algebra, "5", "3", "1", "1", "75%", "8 / 15"]);
    check("student overview: links to each own attempt", [A1, A2, N1].every((id) => page.body.includes(`/student/analytics/attempts/${id}`)));
  }

  // ---- Another student.
  {
    const page = await get(`/student/analytics/attempts/${A1}`, "s2");
    check("another student gets not-found on s1's attempt", isNotFound(page) && !page.body.includes("score out of"));
    const own = await get("/student/analytics", "s2");
    check("another student's overview holds only their own attempt", own.body.includes(`/student/analytics/attempts/${B1}`) && ![A1, A2, N1].some((id) => own.body.includes(`/analytics/attempts/${id}"`)) && !own.body.includes(titleN) && stat(own.body, "1", "mocks submitted"));
    const b1 = await get(`/student/analytics/attempts/${B1}`, "s2");
    check("the phone attempt says unproctored on the student's breakdown", b1.body.includes("Unproctored (phone)") && stat(b1.body, "12", "score out of 12"));
  }

  // ---- Admin.
  {
    const home = await get("/admin/analytics", "admin");
    checkRow("admin home: M with 3 attempts, 2 students, average 6.33", home.body, titleM, [titleM, "3", "2", "6.33"]);
    checkRow("admin home: N with 1 attempt", home.body, titleN, [titleN, "1", "1", "3"]);
    check("admin home: the students list links to s1", home.body.includes(`/admin/analytics/students/${people.s1.id}`));

    const page = await get(`/admin/analytics/mocks/${M}`, "admin");
    check("admin mock: 3 attempts, 2 students, average 6.33, median 5, top 12",
      page.status === 200 && stat(page.body, "3", "submitted attempts") && stat(page.body, "2", "students") && stat(page.body, "6.33", "average of 12") && stat(page.body, "5", "median") && stat(page.body, "12", "top score"));
    check("admin mock: 2 proctored, 1 unproctored (phone)", stat(page.body, "2", "proctored") && stat(page.body, "1", "unproctored (phone)"));
    check("admin mock: distribution, 1 in 0-3, 1 in 3-6, 0 in 6-9, 1 in 9-12",
      same(row(page.body, "0 to under 3"), ["0 to under 3", "1"]) && same(row(page.body, "3 to under 6"), ["3 to under 6", "1"]) && same(row(page.body, "6 to under 9"), ["6 to under 9", "0"]) && same(row(page.body, "9 to 12"), ["9 to 12", "1"]));
    checkRow("admin mock: by section, QA across attempts", page.body, T.qa, [T.qa, "6", "4", "1", "1", "80%", "11 / 18"]);
    checkRow("admin mock: by section, VA across attempts", page.body, T.va, [T.va, "6", "3", "1", "2", "75%", "8 / 18"]);
    checkRow("admin mock: by topic, Tables", page.body, T.tables, [T.tables, "3", "1", "0", "2", "100%", "3 / 9"]);
    checkRow("admin mock: question 1, 67% right, none unanswered", page.body, "Question 1", ["Question 1", `${T.qa} · ${T.algebra} · easy`, "67%", "0%"]);
    checkRow("admin mock: question 2, 67% right, 33% unanswered", page.body, "Question 2", ["Question 2", `${T.qa} · ${T.algebra} · hard`, "67%", "33%"]);
    checkRow("admin mock: question 4 (the DI sub-question), 33% right, 67% unanswered", page.body, "Question 4", ["Question 4", `${T.va} · ${T.tables} · medium`, "33%", "67%"]);
    check("admin mock: the DI passage is not counted as a question", !page.body.includes(">Question 5<"));
    check("admin mock: each attempt is listed with its score and proctoring", page.body.includes("12 / 12") && page.body.includes("Unproctored (phone)") && [A1, A2, B1].every((id) => page.body.includes(`/admin/analytics/attempts/${id}`)));

    const student = await get(`/admin/analytics/students/${people.s1.id}`, "admin");
    check("admin student: s1's overview matches the student's own", stat(student.body, "3", "mocks submitted") && stat(student.body, "67%", "overall accuracy") && same(row(student.body, T.algebra), [T.algebra, "5", "3", "1", "1", "75%", "8 / 15"]));
    const attempt = await get(`/admin/analytics/attempts/${A1}`, "admin");
    check("admin attempt: A1 names its student and matches the student's breakdown", attempt.body.includes(`Analytics s1 ${stamp}`) && stat(attempt.body, "5", "score out of 12") && same(row(attempt.body, T.va), [T.va, "2", "0", "1", "1", "0%", "-1 / 6"]));
  }

  // ---- Mentors.
  {
    const list = await get("/mentor/analytics", "mentor");
    check("assigned mentor: sees s1's three attempts with mock titles, not s2's",
      list.status === 200 && [A1, A2, N1].every((id) => list.body.includes(`/mentor/analytics/attempts/${id}`)) && !list.body.includes(`/mentor/analytics/attempts/${B1}`) && list.body.includes(titleM) && list.body.includes(titleN) && list.body.includes("5 / 12"));
    const a1 = await get(`/mentor/analytics/attempts/${A1}`, "mentor");
    check("assigned mentor: A1's breakdown, read-only, same numbers", stat(a1.body, "5", "score out of 12") && same(row(a1.body, T.qa), [T.qa, "2", "2", "0", "0", "100%", "6 / 6"]) && !a1.body.includes('name="attemptId"') && !a1.body.includes('name="answer"'));
    check("assigned mentor: s2's attempt is not found", isNotFound(await get(`/mentor/analytics/attempts/${B1}`, "mentor")));
    const stranger = await get("/mentor/analytics", "stranger");
    check("unassigned mentor: sees no attempt at all", stranger.status === 200 && ![A1, A2, B1, N1].some((id) => stranger.body.includes(`/analytics/attempts/${id}"`)) && !stranger.body.includes(titleM));
    const strangerA1 = await get(`/mentor/analytics/attempts/${A1}`, "stranger");
    check("unassigned mentor: A1 is not found", isNotFound(strangerA1) && !strangerA1.body.includes("score out of"));
  }

  // ---- Another organisation's admin, and the wrong roles.
  {
    const home = await get("/admin/analytics", "rival");
    check("rival admin: the home lists neither mock nor either student", home.status === 200 && !home.body.includes(titleM) && !home.body.includes(people.s1.id));
    check("rival admin: the mock is not found", isNotFound(await get(`/admin/analytics/mocks/${M}`, "rival")));
    check("rival admin: the attempt is not found", isNotFound(await get(`/admin/analytics/attempts/${A1}`, "rival")));
    check("rival admin: the student is not found", isNotFound(await get(`/admin/analytics/students/${people.s1.id}`, "rival")));
    check("a student is kept out of admin analytics", (await get("/admin/analytics", "s1")).status === 307);
    check("a mentor is kept out of the student route", (await get(`/student/analytics/attempts/${A1}`, "mentor")).status === 307);
    check("an anonymous caller is sent to sign in", (await get("/student/analytics")).status === 307);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
} finally {
  const failed = [];
  const attempt = async (label, run) => {
    const { error } = await run();
    if (error) failed.push(`${label}: ${error.message}`);
  };
  if (made.mocks.length) {
    await attempt("attempts", () => service.from("attempts").delete().in("mock_id", made.mocks));
    await attempt("grants", () => service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks));
    await attempt("mocks", () => service.from("mocks").delete().in("id", made.mocks));
  }
  for (const id of made.questions) {
    await attempt(`key ${id}`, () => service.from("question_keys").delete().eq("question_id", id));
    await attempt(`question ${id}`, () => service.from("questions").delete().eq("id", id));
  }
  if (made.sections.length) await attempt("sections", () => service.from("question_sections").delete().in("id", made.sections));
  // The admin is the assignment's `assigned_by`, which does not cascade, so the
  // assignment goes before any profile.
  if (people.mentor) await attempt("assignment", () => service.from("mentor_assignments").delete().eq("mentor_id", people.mentor.id));
  for (const [key, p] of Object.entries(people)) {
    await attempt(`profile ${key}`, () => service.from("profiles").delete().eq("id", p.id));
    const { error } = await service.auth.admin.deleteUser(p.id);
    if (error) failed.push(`user ${key}: ${error.message}`);
  }
  if (made.org) await attempt("org", () => service.from("orgs").delete().eq("id", made.org));
  for (const line of failed) console.log(`cleanup FAILED: ${line}`);
  const after = await counts();
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
  if (failures) process.exitCode = 1;
}
