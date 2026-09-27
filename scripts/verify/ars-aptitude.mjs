// The ARS aptitude round, linked to a mock test, end to end over HTTP with real
// session cookies and plain form posts, the database read for ground truth
// after each step. Throwaway accounts and fixtures only; everything it creates
// is deleted at the end and the live counts are printed against the baseline.
//
//   node --env-file=.env.local scripts/verify/ars-aptitude.mjs http://127.0.0.1:3050
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3050";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `AptVerify${stamp}x`;
const people = {};
const made = { courses: [], mocks: [], questions: [], rounds: [], sections: [] };
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
async function person(key, role) {
  const email = `apt-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Apt ${key}`, org_id: 1, role });
  if (pe) throw pe;
  people[key] = { id: data.user.id, ...(await signIn(email)) };
}
async function get(path, key) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: people[key].cookie }, redirect: "manual" });
  return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location"), status: r.status };
}
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function hidden(form) {
  const out = [];
  for (const m of form.matchAll(/<input [^>]*>/g)) {
    if (!/type="hidden"/.test(m[0])) continue;
    const n = m[0].match(/name="([^"]*)"/)?.[1];
    if (n) out.push([decode(n), decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "")]);
  }
  return out;
}
async function post(path, key, form, fields) {
  const body = new FormData();
  const names = new Set(fields.map(([n]) => n));
  for (const [n, v] of hidden(form)) if (!names.has(n)) body.append(n, v);
  for (const [n, v] of fields) body.append(n, String(v));
  const r = await fetch(`${BASE}${path}`, { body, headers: { cookie: people[key].cookie, origin: BASE }, method: "POST", redirect: "manual" });
  return { body: await r.text(), location: r.headers.get("location") ?? "", status: r.status };
}
function formWith(html, marker) {
  const form = forms(html).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form carrying ${marker}`);
  return form;
}
const roundConfig = async (id) => (await service.from("ars_rounds").select("config").eq("id", id).single()).data?.config ?? {};
async function counts() {
  const out = {};
  for (const t of ["attempts", "mocks", "questions", "content_access", "profiles", "courses", "ars_rounds"]) {
    out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  }
  return out;
}

const baseline = await counts();
console.log("baseline", JSON.stringify(baseline));

try {
  await person("admin", "admin");
  await person("student", "student");
  await person("other", "student");

  // ---- Fixtures: one question, one mock, a process with an imported-style
  // aptitude round, and both students on the process.
  const { data: section, error: se } = await service.from("question_sections").insert({ name: `Apt QA ${stamp}`, org_id: 1 }).select("id").single();
  if (se) throw se;
  made.sections.push(section.id);
  const { data: question, error: qe } = await people.admin.client.rpc("save_question", {
    p_body: `Apt pick A ${stamp}`, p_correct_answer: { options: ["a"] }, p_difficulty: "easy", p_images: [], p_marks: 3,
    p_options: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }], p_parent_id: null, p_question_id: null,
    p_section_id: section.id, p_solution: null, p_topic: "Apt", p_type: "mcq",
  });
  if (qe) throw qe;
  made.questions.push(question);
  const mockTitle = `Apt mock ${stamp}`;
  const { data: mock, error: me } = await people.admin.client.rpc("save_mock", {
    p_allow_mobile: true, p_duration_minutes: 30, p_instructions: "Read each question carefully.", p_max_attempts: 1,
    p_mock_id: null, p_negative_marking: 0, p_negative_marking_types: ["mcq", "mcq_multi"], p_proctoring_enabled: false,
    p_sections: [{ durationMinutes: null, questions: [question], title: "All questions" }], p_title: mockTitle,
  });
  if (me) throw me;
  made.mocks.push(mock);

  const { data: course, error: ce } = await service.from("courses").insert({ kind: "ars_process", org_id: 1, title: `Apt process ${stamp}` }).select("id").single();
  if (ce) throw ce;
  made.courses.push(course.id);
  const { data: round, error: re } = await service.from("ars_rounds").insert({
    config: { pendingFeature: "test-engine", prompt: "A timed aptitude test.", test: { durationMinutes: 30, questions: 1 } },
    course_id: course.id, name: `Apt aptitude ${stamp}`, org_id: 1, requires_review: false, submission_mode: "offline",
  }).select("id").single();
  if (re) throw re;
  made.rounds.push(round.id);
  for (const key of ["student", "other"]) {
    const { error } = await service.from("content_access").insert({
      granted_by: people.admin.id, org_id: 1, resource_id: course.id, resource_type: "course", student_id: people[key].id,
    });
    if (error) throw error;
  }

  const builderPath = `/admin/ars/${course.id}/rounds/${round.id}`;

  // ---- The admin sees the link control on the offline round.
  let builder = await get(builderPath, "admin");
  check("the builder shows the mock test control on an off-platform round",
    builder.status === 200 && builder.body.includes('name="mockId"') && builder.body.includes(mockTitle) && builder.body.includes("Test not linked"));

  // ---- Refusals leave the config untouched.
  const before = JSON.stringify(await roundConfig(round.id));
  const garbage = await post(builderPath, "admin", formWith(builder.body, 'name="mockId"'), [["mockId", "abc"]]);
  check("a malformed mock id is refused", garbage.location.includes("error=") && JSON.stringify(await roundConfig(round.id)) === before, garbage.location);
  const missing = await post(builderPath, "admin", formWith(builder.body, 'name="mockId"'), [["mockId", "999999999"]]);
  check("a mock the admin cannot read is refused", missing.location.includes("error=") && JSON.stringify(await roundConfig(round.id)) === before, missing.location);

  // ---- Link it through the builder form.
  const linked = await post(builderPath, "admin", formWith(builder.body, 'name="mockId"'), [["mockId", mock]]);
  let config = await roundConfig(round.id);
  check("linking stores config.mockId and clears the placeholder",
    linked.location.includes("notice=mock-linked") && config.mockId === mock && !("pendingFeature" in config),
    JSON.stringify(config));
  check("linking keeps the prompt and the imported specification", config.prompt === "A timed aptitude test." && config.test?.questions === 1);

  builder = await get(builderPath, "admin");
  check("the builder says neither student on the process can open the mock yet",
    builder.body.includes("2 of 2 students on this process cannot open it yet"));

  // ---- The student view before any mock grant.
  let studentPage = await get("/student/ars", "student");
  check("without the mock grant the student is told the test is not open",
    studentPage.status === 200 && studentPage.body.includes("Your admin has not opened this test for you yet") && !studentPage.body.includes(`/student/mocks/${mock}`));

  // ---- Grant the mock to one student through the admin's Students panel.
  const mockPage = await get(`/admin/mocks/${mock}`, "admin");
  const grant = forms(mockPage.body).find((f) => f.includes(people.student.id) && f.includes('value="grant"'));
  if (!grant) throw new Error("no grant form on the mock page");
  await post(`/admin/mocks/${mock}`, "admin", grant, []);
  builder = await get(builderPath, "admin");
  check("the builder now counts one student still without the mock", builder.body.includes("1 of 2 students on this process cannot open it yet"));

  studentPage = await get("/student/ars", "student");
  check("the granted student sees the test's title and a link to take it",
    studentPage.body.includes(mockTitle) && studentPage.body.includes("Take the test") && studentPage.body.includes(`href="/student/mocks/${mock}"`));
  const otherPage = await get("/student/ars", "other");
  check("the student without the mock grant still sees the not-open message, no link",
    otherPage.body.includes("Your admin has not opened this test for you yet") && !otherPage.body.includes(`/student/mocks/${mock}`) && !otherPage.body.includes(mockTitle));

  // ---- The granted student follows the link and starts the test.
  const intro = await get(`/student/mocks/${mock}`, "student");
  check("the link leads to the mock's start page", intro.status === 200 && intro.body.includes("Start test"));
  const started = await post(`/student/mocks/${mock}`, "student", formWith(intro.body, 'name="mockId"'), []);
  const attemptId = Number(started.location.match(/\/student\/attempts\/(\d+)/)?.[1]);
  const { data: attempt } = await service.from("attempts").select("id, status").eq("mock_id", mock).eq("student_id", people.student.id).maybeSingle();
  check("starting creates the student's attempt", Number.isInteger(attemptId) && attempt?.id === attemptId && attempt?.status === "in_progress", started.location);
  studentPage = await get("/student/ars", "student");
  check("the process page reports the attempt in progress", studentPage.body.includes("attempt in progress") && studentPage.body.includes("Continue the test"));

  // ---- Unlinking restores the placeholder.
  builder = await get(builderPath, "admin");
  const unlinked = await post(builderPath, "admin", formWith(builder.body, 'name="mockId"'), [["mockId", ""]]);
  config = await roundConfig(round.id);
  check("unlinking removes mockId and restores the placeholder",
    unlinked.location.includes("notice=mock-unlinked") && !("mockId" in config) && config.pendingFeature === "test-engine", JSON.stringify(config));
} catch (error) {
  check("run completed without throwing", false, String(error?.message ?? error));
} finally {
  const report = (what, { error }) => { if (error) console.log(`cleanup: ${what} not deleted: ${error.message}`); };
  if (made.mocks.length) {
    report("attempts", await service.from("attempts").delete().in("mock_id", made.mocks));
    report("mock grants", await service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks));
  }
  if (made.courses.length) report("process grants", await service.from("content_access").delete().eq("resource_type", "course").in("resource_id", made.courses));
  if (made.rounds.length) report("rounds", await service.from("ars_rounds").delete().in("id", made.rounds));
  if (made.courses.length) report("courses", await service.from("courses").delete().in("id", made.courses));
  if (made.mocks.length) report("mocks", await service.from("mocks").delete().in("id", made.mocks));
  for (const id of made.questions) {
    report("question key", await service.from("question_keys").delete().eq("question_id", id));
    report("question", await service.from("questions").delete().eq("id", id));
  }
  if (made.sections.length) report("sections", await service.from("question_sections").delete().in("id", made.sections));
  for (const p of Object.values(people)) {
    report(`profile ${p.id}`, await service.from("profiles").delete().eq("id", p.id));
    report(`user ${p.id}`, await service.auth.admin.deleteUser(p.id));
  }
  const after = await counts();
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
  console.log(`${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
}
