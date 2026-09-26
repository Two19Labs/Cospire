// A student sits a mock end to end, over HTTP, with real session cookies, every
// step a no-JavaScript form post, and the database read for ground truth after
// each one. Throwaway accounts only; everything it creates is deleted at the end
// and the live counts are printed against the baseline.
//
//   node --env-file=.env.local scripts/verify/test-engine-sit.mjs http://127.0.0.1:3010
//
// It waits about a minute and a half once, for a one-minute paper's clock and
// its 30-second grace to run out.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3010";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `SitVerify${stamp}x`;
const people = {};
const made = { mocks: [], questions: [], sections: [] };
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
let passes = 0;

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) throw new Error(name);
  passes += 1;
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
  const email = `sit-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Sit ${key}`, org_id: 1, role });
  if (pe) throw pe;
  people[key] = { id: data.user.id, ...(await signIn(email)) };
}
async function get(path, key, ua) {
  const headers = {};
  if (key) headers.cookie = people[key].cookie;
  if (ua) headers["user-agent"] = ua;
  const r = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  // React separates adjacent text with <!-- --> markers; read the text as shown.
  return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location"), status: r.status };
}
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// What a browser posts for a form nobody has touched: hidden fields, the
// choices already selected, and the values already typed. Posting only the
// hidden ones would "clear" a saved answer every time a button is pressed.
function hidden(form) {
  const out = [];
  for (const m of form.matchAll(/<input [^>]*>/g)) {
    const type = m[0].match(/type="([^"]*)"/)?.[1] ?? "text";
    const posted = type === "hidden" || ((type === "radio" || type === "checkbox") && /\schecked(=""|\s|\/|>)/.test(m[0])) || (type === "text" && /\svalue="/.test(m[0]));
    if (!posted) continue;
    const n = m[0].match(/name="([^"]*)"/)?.[1];
    if (n) out.push([decode(n), decode(m[0].match(/value="([^"]*)"/)?.[1] ?? "")]);
  }
  return out;
}
async function post(path, key, form, fields, ua) {
  const body = new FormData();
  const names = new Set(fields.map(([n]) => n));
  for (const [n, v] of hidden(form)) if (!names.has(n)) body.append(n, v);
  for (const [n, v] of fields) body.append(n, String(v));
  const headers = { cookie: people[key].cookie, origin: BASE };
  if (ua) headers["user-agent"] = ua;
  const r = await fetch(`${BASE}${path}`, { body, headers, method: "POST", redirect: "manual" });
  return { body: await r.text(), location: r.headers.get("location"), status: r.status };
}
function formWith(html, marker) {
  const form = forms(html).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form carrying ${marker}`);
  return form;
}
const pathOf = (location) => (location ? new globalThis.URL(location, BASE).pathname + new globalThis.URL(location, BASE).search : "");
// A route with a loading.tsx has streamed its skeleton before notFound() runs,
// so "not found" arrives as status 200 carrying the not-found page. Judge by
// what the page says, and by what it does not.
const isNotFound = (page) => page.body.includes("Page not found");
// The proctoring action is called from client code, not a form, so it is
// posted the way the browser does: the page URL, a Next-Action header carrying
// its id, and the arguments as JSON. The id changes on every build, so it is
// read from the built chunks.
function findActionId(name) {
  const stack = [".next/static/chunks"];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const file = join(dir, entry);
      if (statSync(file).isDirectory()) { stack.push(file); continue; }
      if (!file.endsWith(".js")) continue;
      const match = readFileSync(file, "utf8").match(new RegExp(String.raw`createServerReference\)\("([a-f0-9]+)"[^)]{0,120}"` + name + '"'));
      if (match) return match[1];
    }
  }
  throw new Error(`action ${name} not found in the build`);
}
async function callAction(path, key, id, args) {
  const r = await fetch(`${BASE}${path}`, {
    body: JSON.stringify(args),
    headers: { accept: "text/x-component", cookie: people[key].cookie, "content-type": "text/plain;charset=UTF-8", "next-action": id, origin: BASE },
    method: "POST",
  });
  return { body: await r.text(), status: r.status };
}
const eventsFor = async (attempt) => (await service.from("proctor_events").select("event_type").eq("attempt_id", attempt)).data ?? [];
async function saveQuestion(input) {
  const { data, error } = await people.admin.client.rpc("save_question", input);
  if (error) throw error;
  made.questions.push(data);
  return data;
}
async function saveMock(title, minutes, sections, { allowMobile = true, maxAttempts = 1, negative = 1, proctoring = false } = {}) {
  const { data, error } = await people.admin.client.rpc("save_mock", {
    p_allow_mobile: allowMobile, p_duration_minutes: minutes, p_instructions: "Read each question carefully.",
    p_max_attempts: maxAttempts, p_mock_id: null, p_negative_marking: negative,
    p_negative_marking_types: ["mcq", "mcq_multi"], p_proctoring_enabled: proctoring, p_sections: sections, p_title: `${title} ${stamp}`,
  });
  if (error) throw error;
  made.mocks.push(data);
  return data;
}
async function counts() {
  const tables = ["attempts", "mocks", "questions", "content_access", "profiles"];
  const out = {};
  for (const t of tables) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  return out;
}
const baseline = await counts();
console.log("baseline", JSON.stringify(baseline));

try {
  await person("admin", "admin");
  await person("student", "student");
  await person("other", "student");

  // ---- Fixtures: a bank, a free paper, a sectioned paper, a one-minute paper.
  const { data: section, error: se } = await service.from("question_sections").insert({ name: `Sit QA ${stamp}`, org_id: 1 }).select("id").single();
  if (se) throw se;
  made.sections.push(section.id);
  const base = { p_images: [], p_parent_id: null, p_question_id: null, p_section_id: section.id, p_solution: null, p_difficulty: "easy", p_topic: "Sit" };
  const q1 = await saveQuestion({ ...base, p_body: `Pick A ${stamp}`, p_correct_answer: { options: ["a"] }, p_marks: 3, p_options: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }], p_solution: "Alpha is right.", p_type: "mcq" });
  const q2 = await saveQuestion({ ...base, p_body: `Half ${stamp}`, p_correct_answer: { accepted: ["1/2"], tolerance: 0 }, p_marks: 3, p_options: [], p_type: "numerical" });
  const passage = await saveQuestion({ ...base, p_body: `DI passage ${stamp}`, p_correct_answer: null, p_marks: 0, p_options: [], p_type: "di_stimulus" });
  const child = await saveQuestion({ ...base, p_body: `DI child ${stamp}`, p_correct_answer: { accepted: ["7"], tolerance: 0 }, p_marks: 3, p_options: [], p_parent_id: passage, p_type: "numerical" });
  // Children first in cleanup: they reference the passage.
  made.questions.sort((a, b) => (a === child ? -1 : b === child ? 1 : 0));

  const free = await saveMock("Sit free", 30, [{ durationMinutes: null, questions: [q1, q2], title: "All questions" }], { maxAttempts: 2, proctoring: true });
  const sectioned = await saveMock("Sit sectioned", 20, [
    { durationMinutes: 10, questions: [q1], title: "QA" },
    { durationMinutes: 10, questions: [passage, child], title: "DI" },
  ]);
  const quick = await saveMock("Sit quick", 1, [{ durationMinutes: null, questions: [q1], title: "All questions" }], { proctoring: true });
  const proctorAction = findActionId("recordProctorEvent");
  const noPhones = await saveMock("Sit no phones", 30, [{ durationMinutes: null, questions: [q1], title: "All questions" }], { allowMobile: false });

  // ---- Granting, through the admin's Students panel.
  for (const mock of [free, sectioned, quick, noPhones]) {
    const page = await get(`/admin/mocks/${mock}`, "admin");
    const grant = forms(page.body).find((f) => f.includes(people.student.id) && f.includes('value="grant"'));
    if (!grant) throw new Error(`no grant form for mock ${mock}`);
    await post(`/admin/mocks/${mock}`, "admin", grant, []);
  }
  const { count: grants } = await service.from("content_access").select("*", { count: "exact", head: true }).eq("student_id", people.student.id).eq("resource_type", "mock");
  check("the admin grants four mocks through the Students panel", grants === 4);

  // ---- Who sees what.
  const list = await get("/student/mocks", "student");
  check("the student's list shows the granted mocks", list.status === 200 && list.body.includes(`Sit free ${stamp}`) && list.body.includes(`Sit sectioned ${stamp}`));
  const otherList = await get("/student/mocks", "other");
  check("a student without grants sees none of them", otherList.status === 200 && !otherList.body.includes(`Sit free ${stamp}`));
  {
    const page = await get(`/student/mocks/${free}`, "other");
    check("a student without the grant gets not-found on the mock", isNotFound(page) && !page.body.includes("Read each question carefully."));
  }
  check("an admin is kept out of the student route", (await get("/student/mocks", "admin")).status === 307);

  // ---- Start the free paper from a desktop.
  const intro = await get(`/student/mocks/${free}`, "student");
  check("the mock page shows its instructions and a start button", intro.body.includes("Read each question carefully.") && intro.body.includes("Start test"));
  const started = await post(`/student/mocks/${free}`, "student", formWith(intro.body, 'name="mockId"'), []);
  const attemptId = Number(pathOf(started.location).match(/\/student\/attempts\/(\d+)/)?.[1]);
  check("starting redirects into the attempt", started.status === 303 && Number.isInteger(attemptId), started.location ?? "");
  const { data: a1 } = await service.from("attempts").select("started_at, proctored, status").eq("id", attemptId).single();
  check("the server stamped the start, proctored, in progress", a1.status === "in_progress" && a1.proctored === true && Math.abs(Date.now() - Date.parse(a1.started_at)) < 60_000);
  const again = await post(`/student/mocks/${free}`, "student", formWith(intro.body, 'name="mockId"'), []);
  check("starting again resumes the open attempt instead of a second one", pathOf(again.location) === `/student/attempts/${attemptId}`);

  // ---- Answer, navigate, mark for review.
  let screen = await get(`/student/attempts/${attemptId}`, "student");
  check("question 1 renders with its options and the server clock", screen.body.includes(`Pick A ${stamp}`) && screen.body.includes("Alpha") && screen.body.includes("Question 1 of 2"));
  let saved = await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "b"], ["goto", "2"]]);
  check("saving moves to question 2", pathOf(saved.location) === `/student/attempts/${attemptId}?q=2`, saved.location ?? "");
  screen = await get(`/student/attempts/${attemptId}?q=2`, "student");
  const crafted = await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "1/2"], ["answer", "9"], ["goto", "1"]]);
  check("two typed answers in one post are refused", (crafted.location ?? "").includes("error=invalid"));
  saved = await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", " .50 "], ["review", "on"], ["goto", "1"]]);
  const { data: responses } = await service.from("attempt_responses").select("question_id, answer, marked_for_review, is_correct").eq("attempt_id", attemptId);
  const r1 = responses.find((r) => r.question_id === q1);
  const r2 = responses.find((r) => r.question_id === q2);
  check("both answers are stored as posted, unscored", r1?.answer?.options?.[0] === "b" && r2?.answer?.value === ".50" && r1.is_correct === null);
  check("mark for review is stored", r2?.marked_for_review === true && r1?.marked_for_review === false);
  screen = await get(`/student/attempts/${attemptId}?q=1`, "student");
  check("returning to question 1 shows the saved choice", /value="b"[^>]*checked|checked[^>]*value="b"/.test(screen.body));

  // ---- Another student.
  {
    const page = await get(`/student/attempts/${attemptId}`, "other");
    check("another student gets not-found on this attempt", isNotFound(page) && !page.body.includes(`Pick A ${stamp}`));
  }
  await post(`/student/attempts/${attemptId}`, "other", formWith(screen.body, 'name="questionId"'), [["answer", "a"], ["goto", "2"]]);
  const { data: afterOther } = await service.from("attempt_responses").select("answer").eq("attempt_id", attemptId).eq("question_id", q1).single();
  check("another student's post changes nothing", afterOther.answer.options[0] === "b");

  // ---- Proctoring: warn and log, never submit (slice 4.4).
  const attemptPath = `/student/attempts/${attemptId}`;
  await callAction(attemptPath, "student", proctorAction, [attemptId, "tab_hidden"]);
  let logged = await eventsFor(attemptId);
  check("a tab switch on a proctored attempt is logged", logged.length === 1 && logged[0].event_type === "tab_hidden");
  await callAction(attemptPath, "student", proctorAction, [attemptId, "screenshot"]);
  await callAction(attemptPath, "other", proctorAction, [attemptId, "copy"]);
  logged = await eventsFor(attemptId);
  check("an unknown event type, and another student's event on this attempt, log nothing", logged.length === 1);
  const { data: stillOpen } = await service.from("attempts").select("status").eq("id", attemptId).single();
  check("logging an event never ends the attempt", stillOpen.status === "in_progress");

  // ---- Submit and score.
  const confirm = await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["intent", "submit"]]);
  check("submit asks for confirmation first", pathOf(confirm.location) === `/student/attempts/${attemptId}?confirm=submit`);
  const confirmPage = await get(`/student/attempts/${attemptId}?confirm=submit`, "student");
  check("the confirmation counts answered and marked questions", confirmPage.body.includes("Submit the test?") && confirmPage.body.includes("marked for review"));
  await post(`/student/attempts/${attemptId}`, "student", formWith(confirmPage.body, 'id="submit-form"'), []);
  const { data: done } = await service.from("attempts").select("status, submitted_by, score").eq("id", attemptId).single();
  check("the attempt is submitted by the student and scored: -1 wrong MCQ, +3 for .50 = 1/2", done.status === "submitted" && done.submitted_by === "student" && Number(done.score) === 2, JSON.stringify(done));
  const { data: marks } = await service.from("attempt_responses").select("question_id, is_correct, marks_awarded").eq("attempt_id", attemptId);
  check("each answer carries its marks", marks.find((m) => m.question_id === q1)?.marks_awarded == -1 && marks.find((m) => m.question_id === q2)?.is_correct === true);
  const result = await get(`/student/attempts/${attemptId}`, "student");
  check("the result shows the score, the key and the solution", result.body.includes("Your result") && result.body.includes("A. Alpha") && result.body.includes("Alpha is right."));
  await callAction(attemptPath, "student", proctorAction, [attemptId, "paste"]);
  check("nothing is logged after submitting", (await eventsFor(attemptId)).length === 1);
  const adminView = await get(`/admin/mocks/${free}`, "admin");
  check("the admin's Attempts panel shows the attempt and its logged event", adminView.body.includes("Attempts") && adminView.body.includes("Sit student") && adminView.body.includes("Switching away from the tab ×1"));
  await post(`/student/attempts/${attemptId}`, "student", formWith(screen.body, 'name="questionId"'), [["answer", "a"], ["goto", "2"]]);
  const { data: afterSubmit } = await service.from("attempt_responses").select("answer").eq("attempt_id", attemptId).eq("question_id", q1).single();
  check("no answer changes after submitting", afterSubmit.answer.options[0] === "b");

  // ---- Rescoring: the admin corrects q1's key to B through the question editor.
  const editPage = await get(`/admin/questions/${q1}`, "admin");
  const editorForm = formWith(editPage.body, 'name="body"');
  await post(`/admin/questions/${q1}`, "admin", editorForm, [
    ["body", `Pick A ${stamp}`], ["type", "mcq"], ["marks", "3"], ["difficulty", "easy"], ["sectionId", section.id], ["topic", "Sit"],
    ["option-0", "Alpha"], ["option-1", "Beta"], ["correct", "1"], ["solution", "Beta, after the correction."], ["questionId", q1],
  ]);
  const { data: correctedKey } = await service.from("question_keys").select("correct_answer").eq("question_id", q1).single();
  check("the admin's correction saves the new key", correctedKey.correct_answer?.options?.[0] === "b", JSON.stringify(correctedKey));
  const { data: events } = await service.from("rescore_events").select("attempts_affected, reason, changed_by").eq("question_id", q1);
  check("one rescore event records the change, the count and the admin", events.length === 1 && events[0].attempts_affected === 1 && events[0].reason === "answer key changed" && events[0].changed_by === people.admin.id, JSON.stringify(events));
  let rescored = null;
  for (let i = 0; i < 20 && rescored === null; i += 1) {
    const { data } = await service.from("attempts").select("score").eq("id", attemptId).single();
    if (data.score !== null) rescored = Number(data.score);
    else await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check("the attempt is rescored after the save: B is now right, +3 +3 = 6", rescored === 6, String(rescored));
  const rescoredResult = await get(`/student/attempts/${attemptId}`, "student");
  check("the student's result shows the new key", rescoredResult.body.includes("B. Beta") && rescoredResult.body.includes("Beta, after the correction."));

  // ---- An attempted mock is frozen for the builder.
  const edit = await get(`/admin/mocks/${free}`, "admin");
  const editForm = formWith(edit.body, 'name="timingMode"');
  const rebuilt = await post(`/admin/mocks/${free}`, "admin", editForm, [["mockId", free], ["title", `Sit free ${stamp}`], ["durationMinutes", "30"], ["maxAttempts", "2"], ["negativeMarking", "0"], ["timingMode", "overall"], ["questionId", q1], [`questionSection_${q1}`, "0"]]);
  check("the builder refuses to rebuild an attempted mock, and says why", (rebuilt.location ?? "").includes("error=attempted"), `${rebuilt.status} ${rebuilt.location}`);

  // ---- The sectioned paper.
  const sIntro = await get(`/student/mocks/${sectioned}`, "student");
  check("a sectioned mock explains the order", sIntro.body.includes("sat in order"));
  const sStart = await post(`/student/mocks/${sectioned}`, "student", formWith(sIntro.body, 'name="mockId"'), []);
  const sAttempt = Number(pathOf(sStart.location).match(/\/student\/attempts\/(\d+)/)?.[1]);
  let { data: entered } = await service.from("attempt_sections").select("mock_section_id").eq("attempt_id", sAttempt);
  check("the first section opens on start", entered.length === 1);
  let sScreen = await get(`/student/attempts/${sAttempt}`, "student");
  check("only the first section's question is on screen", sScreen.body.includes(`Pick A ${stamp}`) && !sScreen.body.includes(`DI child ${stamp}`) && sScreen.body.includes("QA · Question 1"));
  const leave = await post(`/student/attempts/${sAttempt}`, "student", formWith(sScreen.body, 'name="questionId"'), [["answer", "a"], ["intent", "leave"]]);
  check("leaving a section asks for confirmation", pathOf(leave.location) === `/student/attempts/${sAttempt}?confirm=leave`);
  const leavePage = await get(`/student/attempts/${sAttempt}?confirm=leave`, "student");
  await post(`/student/attempts/${sAttempt}`, "student", formWith(leavePage.body, "Leave section"), []);
  ({ data: entered } = await service.from("attempt_sections").select("mock_section_id, submitted_at").eq("attempt_id", sAttempt));
  check("the first section is closed and the second opened", entered.length === 2 && entered.filter((e) => e.submitted_at).length === 1);
  sScreen = await get(`/student/attempts/${sAttempt}`, "student");
  check("the DI sub-question shows with its passage, once", sScreen.body.includes(`DI passage ${stamp}`) && sScreen.body.includes(`DI child ${stamp}`) && sScreen.body.includes("DI · Question 2 of 2"));
  const late = await post(`/student/attempts/${sAttempt}`, "student", formWith(sScreen.body, 'name="questionId"'), [["questionId", q1], ["answer", "b"], ["goto", "1"]]);
  const { data: q1After } = await service.from("attempt_responses").select("answer").eq("attempt_id", sAttempt).eq("question_id", q1).single();
  check("an answer posted into the closed section is refused by the database", (late.location ?? "").includes("error=closed") && q1After.answer.options[0] === "a");

  // ---- Phones.
  const phoneIntro = await get(`/student/mocks/${noPhones}`, "student", PHONE);
  check("a phone is told this mock is desktop-only", phoneIntro.body.includes("cannot be taken on a phone"));
  const phoneTry = await post(`/student/mocks/${noPhones}`, "student", formWith((await get(`/student/mocks/${noPhones}`, "student")).body, 'name="mockId"'), [], PHONE);
  const { count: phoneAttempts } = await service.from("attempts").select("*", { count: "exact", head: true }).eq("mock_id", noPhones);
  check("a phone attempt on a desktop-only mock is refused, and none is created", (phoneTry.location ?? "").includes("error=phone") && phoneAttempts === 0);

  // ---- The clock: a one-minute paper started from a phone.
  const qIntro = await get(`/student/mocks/${quick}`, "student", PHONE);
  const qStart = await post(`/student/mocks/${quick}`, "student", formWith(qIntro.body, 'name="mockId"'), [], PHONE);
  const qAttempt = Number(pathOf(qStart.location).match(/\/student\/attempts\/(\d+)/)?.[1]);
  const { data: qRow } = await service.from("attempts").select("proctored, started_at").eq("id", qAttempt).single();
  check("a phone attempt is stored unproctored", qRow.proctored === false);
  await callAction(`/student/attempts/${qAttempt}`, "student", proctorAction, [qAttempt, "tab_hidden"]);
  check("a phone attempt is never proctored, so nothing is logged", (await eventsFor(qAttempt)).length === 0);
  check("the admin sees the phone attempt marked unproctored", (await get(`/admin/mocks/${quick}`, "admin")).body.includes("Unproctored (phone)"));
  const qScreen = await get(`/student/attempts/${qAttempt}`, "student");
  console.log("      waiting 95 seconds for the one-minute clock and its grace...");
  await new Promise((resolve) => setTimeout(resolve, 95_000));
  const expired = await post(`/student/attempts/${qAttempt}`, "student", formWith(qScreen.body, 'name="questionId"'), [["answer", "a"], ["goto", "1"]]);
  const { count: lateRows } = await service.from("attempt_responses").select("*", { count: "exact", head: true }).eq("attempt_id", qAttempt);
  check("after the clock and grace, an answer is refused though never submitted", (expired.location ?? "").includes("error=closed") && lateRows === 0);
  const overPage = await get(`/student/attempts/${qAttempt}`, "student");
  check("the page says time is up", overPage.body.includes("Time is up"));
  await post(`/student/attempts/${qAttempt}`, "student", formWith(overPage.body, 'id="submit-form"'), []);
  const { data: qDone } = await service.from("attempts").select("status, submitted_by, submitted_at, started_at, score").eq("id", qAttempt).single();
  check("it closes as the timer's, at the moment the clock ran out, scored 0",
    qDone.status === "submitted" && qDone.submitted_by === "timer" && Date.parse(qDone.submitted_at) - Date.parse(qDone.started_at) === 60_000 && Number(qDone.score) === 0,
    JSON.stringify(qDone));
  const qResult = await get(`/student/attempts/${qAttempt}`, "student");
  check("the result says unproctored and that the time ran out", qResult.body.includes("unproctored") && qResult.body.includes("when the time ran out"));

  console.log(`\n${passes} of ${passes} passed`);
} finally {
  if (made.mocks.length) {
    await service.from("attempts").delete().in("mock_id", made.mocks);
    await service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks);
    await service.from("mocks").delete().in("id", made.mocks);
  }
  if (made.questions.length) await service.from("rescore_events").delete().in("question_id", made.questions);
  for (const id of made.questions) {
    await service.from("question_keys").delete().eq("question_id", id);
    await service.from("questions").delete().eq("id", id);
  }
  if (made.sections.length) await service.from("question_sections").delete().in("id", made.sections);
  for (const p of Object.values(people)) {
    const { error: profileError } = await service.from("profiles").delete().eq("id", p.id);
    if (profileError) console.log(`cleanup: profile ${p.id} not deleted: ${profileError.message}`);
    const { error: userError } = await service.auth.admin.deleteUser(p.id);
    if (userError) console.log(`cleanup: user ${p.id} not deleted: ${userError.message}`);
  }
  const after = await counts();
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
}
