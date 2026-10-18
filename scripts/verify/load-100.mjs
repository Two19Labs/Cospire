// Clause 3.1 measured: 100 students sitting the SAME mock at the same time,
// against the deployed application, over HTTP, as a browser drives it.
//
//   node --env-file=.env.local scripts/verify/load-100.mjs https://cospire-roan.vercel.app
//
// Ramps 10 -> 50 -> 100 concurrent students, each step a full sitting of a short
// paper. Half the students submit themselves; the other half let the clock run
// out, split again between the browser's own time-up submit and going quiet so
// the `close-expired-attempts` sweep closes them. Every request is timed and
// classified, every save the client saw succeed is checked against
// `attempt_responses`, and every attempt's score is checked against the answers
// this script sent.
//
// It stops after any step whose error rate is above 10%, rather than pressing on
// into a site that is already failing.
//
// Everything it creates is deleted in a `finally` block and the live counts are
// printed against the baseline it recorded first. Annexure B excludes capacity
// beyond 100 users, so 100 is the ceiling here by design.
//
//   LOAD_STEPS=10,50,100   the ramp
//   LOAD_GAP_SECONDS=120   quiet time between steps
//   LOAD_MINUTES=3         the paper's clock
//   LOAD_SAVE_SECONDS=5    mean gap between one student's answer saves
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "https://cospire-roan.vercel.app";
const STEPS = (process.env.LOAD_STEPS ?? "10,50,100").split(",").map(Number);
const GAP_SECONDS = Number(process.env.LOAD_GAP_SECONDS ?? 120);
const MINUTES = Number(process.env.LOAD_MINUTES ?? 3);
const SAVE_SECONDS = Number(process.env.LOAD_SAVE_SECONDS ?? 5);
const REQUEST_TIMEOUT_MS = 30_000;
const GRACE_MS = 30_000; // private.attempt_grace(), mirrored in src/features/test-engine/clock.ts

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });

const POPULATION = Math.max(...STEPS);
if (POPULATION > 100) throw new Error("Annexure B excludes capacity beyond 100 concurrent users");

const stamp = Date.now();
const runId = `load${stamp}`;
const password = `Load${stamp}x`;
const students = []; // { index, id, email, cookie, client }
const made = { mocks: [], questions: [], sections: [] };
let admin = null;
const failures = [];

// ---------------------------------------------------------------- measurement
// One row per request: type, how long it took, and whether it counted as an
// error. Nothing is averaged while the step runs, so timing the run never costs
// the run anything.
const samples = [];
function record(type, started, status, ok, note) {
  const row = { type, ms: Date.now() - started, status, ok, note, at: started };
  samples.push(row);
  // Returned so a caller can reclassify its own request later. Indexing into
  // `samples` cannot: the database probe appends to it from a parallel loop.
  return row;
}
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] : null);
function summarise(rows) {
  const byType = new Map();
  for (const row of rows) {
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type).push(row);
  }
  const out = [];
  for (const [type, list] of [...byType.entries()].sort()) {
    const ms = list.map((r) => r.ms).sort((a, b) => a - b);
    const errors = list.filter((r) => !r.ok);
    out.push({
      type,
      n: list.length,
      errors: errors.length,
      p50: quantile(ms, 0.5),
      p95: quantile(ms, 0.95),
      p99: quantile(ms, 0.99),
      max: ms[ms.length - 1] ?? null,
    });
  }
  return out;
}
function errorBreakdown(rows) {
  const counts = new Map();
  for (const row of rows.filter((r) => !r.ok)) {
    const key = `${row.type} ${row.note ?? row.status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
function table(rows) {
  const head = ["request", "n", "errors", "p50", "p95", "p99", "max"];
  const widths = head.map((h) => h.length);
  const body = rows.map((r) => [r.type, r.n, r.errors, r.p50, r.p95, r.p99, r.max].map(String));
  for (const row of body) row.forEach((cell, i) => (widths[i] = Math.max(widths[i], cell.length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  return [line(head), ...body.map(line)].join("\n");
}

// ------------------------------------------------------------------- the app
// The same helpers the other harnesses here use: a real session cookie, the
// hidden fields a browser replays, and the `Next-Action` protocol for the one
// save the exam screen makes in the background.
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
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
function formWith(html, marker) {
  const form = forms(html).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form carrying ${marker}`);
  return form;
}
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
// Every request the app serves goes through here, so one place decides what an
// error is: a 5xx, a timeout, a dropped connection.
async function timed(type, run) {
  const started = Date.now();
  try {
    const result = await run();
    const ok = result.status < 500;
    const sample = record(type, started, result.status, ok, ok ? undefined : `http ${result.status}`);
    // `x-vercel-id` names the region and whether the function was cold, which is
    // the only split between "the function was slow" and "the trip was long"
    // that a client outside Vercel can see.
    sample.server = result.server;
    return { ...result, sample };
  } catch (error) {
    const note = error.name === "TimeoutError" || error.name === "AbortError" ? "timeout" : `${error.name}: ${error.message}`.slice(0, 80);
    const sample = record(type, started, 0, false, note);
    return { status: 0, body: "", location: null, failed: note, sample };
  }
}
async function get(type, path, who) {
  return timed(type, async () => {
    const r = await fetch(`${BASE}${path}`, {
      headers: who ? { cookie: who.cookie } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location"), server: r.headers.get("x-vercel-id"), status: r.status };
  });
}
async function post(type, path, who, form, fields) {
  return timed(type, async () => {
    const body = new FormData();
    const names = new Set(fields.map(([n]) => n));
    for (const [n, v] of hidden(form)) if (!names.has(n)) body.append(n, v);
    for (const [n, v] of fields) body.append(n, String(v));
    const r = await fetch(`${BASE}${path}`, {
      body,
      headers: { cookie: who.cookie, origin: BASE },
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { body: await r.text(), location: r.headers.get("location"), server: r.headers.get("x-vercel-id"), status: r.status };
  });
}
async function callAction(type, path, who, id, args) {
  const result = await timed(type, async () => {
    const r = await fetch(`${BASE}${path}`, {
      body: JSON.stringify(args),
      headers: { accept: "text/x-component", cookie: who.cookie, "content-type": "text/plain;charset=UTF-8", "next-action": id, origin: BASE },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { body: await r.text(), location: null, server: r.headers.get("x-vercel-id"), status: r.status };
  });
  const ok = result.status === 200 && result.body.includes('"ok":true');
  // An action that answered 200 and refused the save is a failed action, not a
  // slow one, so it is counted as an error here rather than passing silently.
  if (!ok && result.status < 500 && !result.failed) {
    const reason = result.body.match(/"reason":"([a-z]+)"/)?.[1] ?? `status ${result.status}`;
    result.sample.ok = false;
    result.sample.note = `refused: ${reason}`;
  }
  return { ...result, ok };
}
// Action ids are per build, so read the one the deployed build serves.
async function findActionId(path, who, name) {
  const page = await get("page", path, who);
  const pattern = new RegExp(String.raw`createServerReference\)\("([a-f0-9]+)"[^)]{0,120}"` + name + '"');
  for (const [, src] of page.body.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) {
    const match = (await (await fetch(src.startsWith("http") ? src : `${BASE}${src}`)).text()).match(pattern);
    if (match) return match[1];
  }
  throw new Error(`action ${name} not found in the scripts ${path} serves`);
}
const pathOf = (location) => (location ? new globalThis.URL(location, BASE).pathname + new globalThis.URL(location, BASE).search : "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures.push(name);
  return pass;
}

// ------------------------------------------------------------------ the paper
// Five questions, three MCQ and two numerical, three marks each, one penalty
// mark on the MCQ types only -- real CAT, and the default in the manual.
const PAPER = [
  { type: "mcq", key: "a", wrong: "b", marks: 3, penalised: true },
  { type: "mcq", key: "b", wrong: "a", marks: 3, penalised: true },
  { type: "mcq", key: "c", wrong: "a", marks: 3, penalised: true },
  { type: "numerical", key: "12", wrong: "13", marks: 3, penalised: false },
  { type: "numerical", key: "0.5", wrong: "0.7", marks: 3, penalised: false },
];
const NEGATIVE = 1;
// Deterministic per student, so the expected score is arithmetic rather than a
// read-back of whatever happened to be stored.
const answersFor = (index) =>
  PAPER.map((q, j) => {
    if (j === 4 && index % 5 === 0) return null; // left unanswered on purpose
    return (index + j) % 3 === 0 ? q.wrong : q.key;
  });
// Scored from the answers the client saw accepted, not from what the script
// meant to send, so a dropped save shows up as a lost answer rather than
// quietly becoming a wrong score. A separate check requires every intended
// answer to have been accepted, so under no failures the two are the same.
const expectedScore = (confirmed, questionIds) =>
  questionIds.reduce((total, questionId, j) => {
    const answer = confirmed.get(questionId);
    const q = PAPER[j];
    if (answer === undefined) return total;
    if (answer === q.key) return total + q.marks;
    return total - (q.penalised ? NEGATIVE : 0);
  }, 0);

async function counts() {
  const tables = ["profiles", "attempts", "attempt_responses", "mocks", "questions", "question_sections", "content_access", "activity_log"];
  const out = {};
  for (const t of tables) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  return out;
}

const baseline = await counts();
console.log(`run ${runId} against ${BASE}`);
console.log("baseline", JSON.stringify(baseline));

let stoppedEarly = null;
const stepReports = [];

try {
  // ----------------------------------------------------------------- fixtures
  const adminEmail = `${runId}-admin@example.com`;
  {
    const { data, error } = await service.auth.admin.createUser({ email: adminEmail, email_confirm: true, password });
    if (error) throw error;
    const { error: pe } = await service.from("profiles").insert({ email: adminEmail, id: data.user.id, name: `Load admin ${stamp}`, org_id: 1, role: "admin" });
    if (pe) throw pe;
    admin = { id: data.user.id, email: adminEmail, ...(await signIn(adminEmail)) };
  }

  // 100 throwaway students. Created with the Auth admin API and email already
  // confirmed, so no invitation is ever sent (SMTP is not configured and the
  // built-in sender is rate limited to two an hour).
  console.log(`creating ${POPULATION} student accounts...`);
  const created = [];
  for (let start = 0; start < POPULATION; start += 10) {
    const batch = [];
    for (let i = start; i < Math.min(start + 10, POPULATION); i += 1) {
      const email = `${runId}-s${String(i).padStart(3, "0")}@example.com`;
      batch.push(
        service.auth.admin.createUser({ email, email_confirm: true, password }).then(({ data, error }) => {
          if (error) throw new Error(`create ${email}: ${error.message}`);
          return { email, id: data.user.id, index: i };
        }),
      );
    }
    created.push(...(await Promise.all(batch)));
  }
  created.sort((a, b) => a.index - b.index);
  const { error: profilesError } = await service
    .from("profiles")
    .insert(created.map((s) => ({ email: s.email, id: s.id, name: `Load student ${s.index}`, org_id: 1, role: "student" })));
  if (profilesError) throw profilesError;
  students.push(...created);

  const { data: section, error: se } = await service.from("question_sections").insert({ name: `Load QA ${stamp}`, org_id: 1 }).select("id").single();
  if (se) throw se;
  made.sections.push(section.id);
  const base = { p_images: [], p_parent_id: null, p_question_id: null, p_section_id: section.id, p_solution: "Recorded by the load test.", p_difficulty: "easy", p_topic: "Load" };
  const questionIds = [];
  for (const [j, q] of PAPER.entries()) {
    const { data, error } = await admin.client.rpc("save_question", {
      ...base,
      p_body: `Load Q${j + 1} ${stamp}`,
      p_correct_answer: q.type === "mcq" ? { options: [q.key] } : { accepted: [q.key], tolerance: 0 },
      p_marks: q.marks,
      p_options: q.type === "mcq" ? [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }, { id: "c", text: "Gamma" }] : [],
      p_type: q.type,
    });
    if (error) throw error;
    questionIds.push(data);
    made.questions.push(data);
  }
  const { data: mockId, error: me } = await admin.client.rpc("save_mock", {
    p_allow_mobile: true,
    p_duration_minutes: MINUTES,
    p_instructions: "Load test paper. Answer every question.",
    p_max_attempts: STEPS.length + 1,
    p_mock_id: null,
    p_negative_marking: NEGATIVE,
    p_negative_marking_types: ["mcq", "mcq_multi"],
    p_proctoring_enabled: false,
    p_sections: [{ durationMinutes: null, questions: questionIds, title: "All questions" }],
    p_title: `Load test ${stamp}`,
  });
  if (me) throw me;
  made.mocks.push(mockId);

  const { error: grantError } = await service
    .from("content_access")
    .insert(students.map((s) => ({ granted_by: admin.id, org_id: 1, resource_id: mockId, resource_type: "mock", student_id: s.id })));
  if (grantError) throw grantError;
  console.log(`mock ${mockId}, ${questionIds.length} questions, ${students.length} grants`);

  // `saveResponseAction` only appears in the chunks the exam screen serves, so
  // one extra student starts one attempt to read the id the deployed build is
  // using, and that attempt is deleted again before the ramp begins.
  const probeEmail = `${runId}-probe@example.com`;
  let saveActionId;
  {
    const { data, error } = await service.auth.admin.createUser({ email: probeEmail, email_confirm: true, password });
    if (error) throw error;
    const { error: pe } = await service.from("profiles").insert({ email: probeEmail, id: data.user.id, name: `Load probe ${stamp}`, org_id: 1, role: "student" });
    if (pe) throw pe;
    const probe = { id: data.user.id, email: probeEmail, index: -1, ...(await signIn(probeEmail)) };
    students.push(probe); // for teardown; never part of the ramp
    const { error: ge } = await service.from("content_access").insert({ granted_by: admin.id, org_id: 1, resource_id: mockId, resource_type: "mock", student_id: probe.id });
    if (ge) throw ge;
    const intro = await get("page", `/student/mocks/${mockId}`, probe);
    const started = await post("start", `/student/mocks/${mockId}`, probe, formWith(intro.body, 'name="mockId"'), []);
    const probeAttempt = Number(pathOf(started.location).match(/\/student\/attempts\/(\d+)/)?.[1]);
    if (!Number.isInteger(probeAttempt)) throw new Error(`probe could not start an attempt: ${started.status} ${started.location ?? ""}`);
    saveActionId = await findActionId(`/student/attempts/${probeAttempt}`, probe, "saveResponseAction");
    await service.from("attempts").delete().eq("id", probeAttempt);
  }
  console.log(`saveResponseAction id ${saveActionId}`);

  // --------------------------------------------------------------- one sitting
  // What one student does, as the browser does it: sign in, the mock list, the
  // mock, Start, then answers saved in the background while the moves between
  // questions happen client-side, one reload mid-paper, submit, the result.
  async function sit(student, role) {
    const signed = Date.now();
    if (!student.cookie) try {
      const session = await signIn(student.email);
      student.cookie = session.cookie;
      record("signin", signed, 200, true);
    } catch (error) {
      record("signin", signed, error.status ?? 0, false, `signin: ${error.message}`.slice(0, 80));
      return { student, role, failed: "signin" };
    }

    await get("page", "/student/mocks", student);
    const intro = await get("page", `/student/mocks/${mockId}`, student);
    if (!intro.body.includes('name="mockId"')) return { student, role, failed: `intro ${intro.status}` };
    const started = await post("start", `/student/mocks/${mockId}`, student, formWith(intro.body, 'name="mockId"'), []);
    const attemptId = Number(pathOf(started.location).match(/\/student\/attempts\/(\d+)/)?.[1]);
    if (!Number.isInteger(attemptId)) return { student, role, failed: `start ${started.status} ${started.location ?? ""}` };
    const attemptPath = `/student/attempts/${attemptId}`;
    await get("page", attemptPath, student);
    const startedAt = Date.now();
    const deadline = startedAt + MINUTES * 60_000;

    // Answers the client saw succeed, by question. This is what "lost answers"
    // is measured against afterwards.
    const confirmed = new Map();
    const wanted = answersFor(student.index);
    const save = async (j) => {
      const answer = wanted[j];
      if (answer === null) return;
      const r = await callAction("save", attemptPath, student, saveActionId, [attemptId, questionIds[j], [answer], false]);
      if (r.ok) confirmed.set(questionIds[j], answer);
    };
    // First pass: every question answered once, the way a student works through
    // a paper. Then back and forth over them until it is time to stop.
    for (let j = 0; j < PAPER.length; j += 1) {
      await save(j);
      await sleep(1000 + Math.random() * 1000);
    }
    const stopSaving = role === "self" ? deadline - 45_000 : deadline - 5_000;
    let reloaded = false;
    let turn = 0;
    while (Date.now() < stopSaving) {
      const j = turn % PAPER.length;
      turn += 1;
      await save(j);
      if (!reloaded) {
        reloaded = true;
        await get("page", `${attemptPath}?q=${j + 1}`, student);
      }
      await sleep(SAVE_SECONDS * 1000 * (0.7 + Math.random() * 0.6));
    }

    if (role === "self") {
      // The page is fetched again first, because a browser posts the form as it
      // stands on screen -- answers included. Replaying a stale copy of the
      // page would post the question's answer field empty and clear it.
      const current = await get("page", attemptPath, student);
      const confirmPost = await post("submit", attemptPath, student, formWith(current.body, 'name="questionId"'), [["intent", "submit"]]);
      const confirmPage = await get("page", pathOf(confirmPost.location) || `${attemptPath}?confirm=submit`, student);
      if (!confirmPage.body.includes('id="submit-form"')) return { attemptId, confirmed, student, role, failed: "no submit form" };
      await post("submit", attemptPath, student, formWith(confirmPage.body, 'id="submit-form"'), []);
    }
    return { attemptId, confirmed, deadline, role, student };
  }

  // ------------------------------------------------------------- sign-ins first
  // A room signs in over minutes, not in one second: Supabase Auth refuses a
  // burst of more than about 30 sign-ins from one address (measured 2026-10-17),
  // and this machine is one address. So every student signs in once, spaced,
  // before the ramp, and each sitting reuses that session. SIGNIN_SPACING_MS=0
  // restores the old same-second burst.
  const spacing = Number(process.env.SIGNIN_SPACING_MS ?? 2200);
  if (spacing > 0) {
    console.log(`signing in ${POPULATION} students, ${spacing} ms apart...`);
    let refused = 0;
    for (const student of students.slice(0, POPULATION)) {
      try {
        student.cookie = (await signIn(student.email)).cookie;
      } catch {
        refused += 1;
      }
      await sleep(spacing);
    }
    console.log(`signed in ${POPULATION - refused} of ${POPULATION}${refused ? `; ${refused} refused, they sign in during their sitting` : ""}`);
  }

  // ------------------------------------------------------------------ the ramp
  for (const [stepIndex, size] of STEPS.entries()) {
    if (stoppedEarly) break;
    const from = samples.length;
    const stepStarted = Date.now();
    console.log(`\n=== step ${stepIndex + 1}: ${size} concurrent students, ${MINUTES}-minute paper ===`);

    // Half submit themselves; the other half let the clock run out, split
    // between the browser's own time-up submit and going quiet for the sweep.
    const roles = Array.from({ length: size }, (_, i) => (i % 2 === 0 ? "self" : i % 4 === 1 ? "timeup" : "quiet"));

    // While the step runs, a trivial query of its own against the database, so
    // a slow page can be told apart from a busy database.
    let probing = true;
    const dbProbe = (async () => {
      while (probing) {
        const at = Date.now();
        const { error } = await service.from("mocks").select("id").eq("id", mockId).single();
        record("db-probe", at, error ? 0 : 200, !error, error?.message?.slice(0, 60));
        await sleep(2000);
      }
    })();

    const sittings = await Promise.all(students.slice(0, size).map((s, i) => sit(s, roles[i])));
    const good = sittings.filter((s) => s.attemptId);
    console.log(`${good.length} of ${size} sittings reached an attempt`);

    // The clock, under load: once the last deadline and its grace have passed,
    // a save must be refused and must change nothing.
    const lastDeadline = Math.max(...good.map((s) => s.deadline ?? 0));
    await sleep(lastDeadline + GRACE_MS + 5_000 - Date.now());
    const lateVictims = good.filter((s) => s.role !== "self").slice(0, 3);
    let lateRefused = 0;
    for (const victim of lateVictims) {
      const before = await service.from("attempt_responses").select("answer").eq("attempt_id", victim.attemptId).eq("question_id", questionIds[0]).maybeSingle();
      const late = await callAction("late-save", `/student/attempts/${victim.attemptId}`, victim.student, saveActionId, [victim.attemptId, questionIds[0], [PAPER[0].wrong], false]);
      const after = await service.from("attempt_responses").select("answer").eq("attempt_id", victim.attemptId).eq("question_id", questionIds[0]).maybeSingle();
      if (!late.ok && JSON.stringify(before.data) === JSON.stringify(after.data)) lateRefused += 1;
      // A late save is supposed to be refused, so it is not an error of the run.
      late.sample.ok = true;
      late.sample.note = undefined;
    }
    check(`step ${stepIndex + 1}: a save after the clock and its grace is refused under load, and changes nothing`, lateVictims.length > 0 && lateRefused === lateVictims.length, `${lateRefused}/${lateVictims.length}`);

    // The browser's own time-up submit, for the students whose clock ran out
    // with the page still open.
    for (const s of good.filter((x) => x.role === "timeup")) {
      const page = await get("page", `/student/attempts/${s.attemptId}`, s.student);
      if (page.body.includes('id="submit-form"')) await post("submit", `/student/attempts/${s.attemptId}`, s.student, formWith(page.body, 'id="submit-form"'), []);
    }

    // And the sweep, for the ones who walked away. pg_cron runs it every minute.
    const quiet = good.filter((x) => x.role === "quiet").map((x) => x.attemptId);
    let swept = 0;
    for (let i = 0; i < 40 && quiet.length && swept < quiet.length; i += 1) {
      const { count } = await service.from("attempts").select("*", { count: "exact", head: true }).in("id", quiet).eq("status", "submitted");
      swept = count ?? 0;
      if (swept < quiet.length) await sleep(5_000);
    }
    check(`step ${stepIndex + 1}: the closing sweep submitted every abandoned attempt`, quiet.length > 0 && swept === quiet.length, `${swept}/${quiet.length}`);

    probing = false;
    await dbProbe;

    // The result page, which is also where an attempt the sweep closed is
    // scored (the sweep deliberately leaves `score` null).
    await Promise.all(good.map((s) => get("result", `/student/attempts/${s.attemptId}`, s.student)));

    // ---- Ground truth: no lost answers, every attempt closed and scored right.
    const attemptIds = good.map((s) => s.attemptId);
    const { data: rows } = await service.from("attempt_responses").select("attempt_id, question_id, answer").in("attempt_id", attemptIds);
    const stored = new Map();
    for (const row of rows ?? []) stored.set(`${row.attempt_id}:${row.question_id}`, row.answer?.value ?? row.answer?.options?.[0]);
    let lost = 0;
    const lostDetail = [];
    for (const s of good) {
      for (const [questionId, answer] of s.confirmed) {
        const got = stored.get(`${s.attemptId}:${questionId}`);
        if (got !== answer) {
          lost += 1;
          if (lostDetail.length < 5) lostDetail.push(`attempt ${s.attemptId} q${questionId}: saved ${answer}, stored ${got ?? "nothing"}`);
        }
      }
    }
    check(`step ${stepIndex + 1}: no answer the client saw saved is missing from attempt_responses`, lost === 0, lost ? lostDetail.join("; ") : `${good.reduce((n, s) => n + s.confirmed.size, 0)} confirmed saves all present`);
    const incomplete = good.filter((s) => s.confirmed.size !== answersFor(s.student.index).filter((a) => a !== null).length);
    check(`step ${stepIndex + 1}: every intended answer was accepted`, incomplete.length === 0,
      incomplete.length ? incomplete.slice(0, 5).map((s) => `attempt ${s.attemptId}: ${s.confirmed.size} of ${answersFor(s.student.index).filter((a) => a !== null).length}`).join("; ") : `${good.length} students`);

    let scores = [];
    for (let i = 0; i < 24; i += 1) {
      ({ data: scores } = await service.from("attempts").select("id, status, score, submitted_by").in("id", attemptIds));
      if (scores.every((a) => a.status === "submitted" && a.score !== null)) break;
      await sleep(5_000);
    }
    const unscored = scores.filter((a) => a.status !== "submitted" || a.score === null);
    check(`step ${stepIndex + 1}: every attempt is submitted and scored`, unscored.length === 0, `${scores.length - unscored.length}/${scores.length}`);
    const byId = new Map(scores.map((a) => [a.id, a]));
    const wrongScores = good
      .map((s) => ({ attemptId: s.attemptId, expected: expectedScore(s.confirmed, questionIds), got: Number(byId.get(s.attemptId)?.score) }))
      .filter((r) => r.got !== r.expected);
    check(`step ${stepIndex + 1}: every score equals the answers this script sent`, wrongScores.length === 0,
      wrongScores.length ? wrongScores.slice(0, 5).map((r) => `attempt ${r.attemptId}: expected ${r.expected}, got ${r.got}`).join("; ") : `${good.length} attempts`);

    // ---- The numbers for this step.
    const stepSamples = samples.slice(from);
    const app = stepSamples.filter((r) => r.type !== "db-probe");
    const errorRate = app.length ? (app.filter((r) => !r.ok).length / app.length) * 100 : 0;
    const rows95 = summarise(stepSamples);
    const saveRow = rows95.find((r) => r.type === "save");
    const pageRow = rows95.find((r) => r.type === "page");
    console.log(`\nstep ${stepIndex + 1}: ${size} students, ${app.length} app requests in ${Math.round((Date.now() - stepStarted) / 1000)} s, error rate ${errorRate.toFixed(2)}%`);
    console.log(table(rows95));
    const breakdown = errorBreakdown(stepSamples);
    if (breakdown.length) console.log("errors:", breakdown.map(([k, n]) => `${k} x${n}`).join(", "));
    const regions = new Set(app.map((r) => r.server?.split("::")[0]).filter(Boolean));
    const dbProbeRow = rows95.find((r) => r.type === "db-probe");
    console.log(`served from ${[...regions].join(", ") || "unknown"}; database round trip from this client p50 ${dbProbeRow?.p50} ms, p95 ${dbProbeRow?.p95} ms`);
    check(`step ${stepIndex + 1}: error rate under 1%`, errorRate < 1, `${errorRate.toFixed(2)}%`);
    check(`step ${stepIndex + 1}: answer save p95 under 1000 ms`, saveRow != null && saveRow.p95 < 1000, `${saveRow?.p95} ms`);
    check(`step ${stepIndex + 1}: page load p95 under 2000 ms`, pageRow != null && pageRow.p95 < 2000, `${pageRow?.p95} ms`);
    stepReports.push({ size, requests: app.length, errorRate, rows: rows95, breakdown, seconds: Math.round((Date.now() - stepStarted) / 1000) });

    if (errorRate > 10) {
      stoppedEarly = `step ${stepIndex + 1} (${size} students) had an error rate of ${errorRate.toFixed(2)}%, above the 10% stop threshold`;
      console.log(`\nSTOPPING: ${stoppedEarly}`);
      break;
    }
    if (stepIndex < STEPS.length - 1) {
      console.log(`\nquiet for ${GAP_SECONDS} s before the next step...`);
      await sleep(GAP_SECONDS * 1000);
    }
  }

  // ------------------------------------------------------------------ summary
  console.log("\n================ results ================");
  for (const r of stepReports) {
    console.log(`\n${r.size} concurrent students -- ${r.requests} app requests, ${r.seconds} s, error rate ${r.errorRate.toFixed(2)}%`);
    console.log(table(r.rows));
    if (r.breakdown.length) console.log("errors:", r.breakdown.map(([k, n]) => `${k} x${n}`).join(", "));
  }
  if (stoppedEarly) console.log(`\nstopped early: ${stoppedEarly}`);
  console.log(`\n${failures.length ? `FAILED: ${failures.join(" | ")}` : "all checks passed"}`);
} finally {
  // ----------------------------------------------------------------- teardown
  // Never leave the accounts behind. Order is forced by the schema:
  // content_access.granted_by and attempts reference profiles.
  console.log("\ncleaning up...");
  const ids = [...students.map((s) => s.id), ...(admin ? [admin.id] : [])];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (made.mocks.length) {
      await service.from("attempts").delete().in("mock_id", made.mocks);
      await service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks);
      await service.from("mocks").delete().in("id", made.mocks);
    }
    if (made.questions.length) {
      await service.from("rescore_events").delete().in("question_id", made.questions);
      for (const id of made.questions) {
        await service.from("question_keys").delete().eq("question_id", id);
        await service.from("questions").delete().eq("id", id);
      }
    }
    if (made.sections.length) await service.from("question_sections").delete().in("id", made.sections);
    if (ids.length) {
      await service.from("activity_log").delete().in("user_id", ids);
      await service.from("profiles").delete().in("id", ids);
      for (const id of ids) {
        const { error } = await service.auth.admin.deleteUser(id);
        if (error && attempt === 3) console.log(`cleanup: user ${id} not deleted: ${error.message}`);
      }
    }
    const { count: left } = await service.from("profiles").select("*", { count: "exact", head: true }).like("email", `${runId}%`);
    if (!left) break;
    console.log(`cleanup pass ${attempt}: ${left} profiles left, retrying`);
    await sleep(2000);
  }
  const after = await counts();
  console.log("baseline", JSON.stringify(baseline));
  console.log("after   ", JSON.stringify(after));
  console.log(JSON.stringify(after) === JSON.stringify(baseline) ? "counts back to baseline" : "COUNTS DIFFER FROM BASELINE");
  if (failures.length) process.exitCode = 1;
}
