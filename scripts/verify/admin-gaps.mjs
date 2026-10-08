// Phase 6.6, admin gaps, end to end over HTTP with real session cookies and the
// hosted database read for ground truth. Two parts:
//
//   A. The admin's view of every ARS submission. Needs no migration.
//   B. The activity log and its flags. Needs 20261008130000_activity_log.sql
//      applied; until it is, part B reports itself skipped and FAILS the run,
//      so a green result can never be mistaken for B having been checked.
//   C. D8: the mock-first importer opened from an ARS aptitude round, the
//      mock it builds linked to that round. Needs no migration. Reads action
//      ids from this checkout's .next, so run it against a build of the same
//      code.
//
// Throwaway accounts and fixtures only; everything it creates is deleted at the
// end and the live counts are printed against the baseline.
//
//   node --env-file=.env.local scripts/verify/admin-gaps.mjs http://127.0.0.1:3070
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node");
const manifest = JSON.parse(readFileSync(new globalThis.URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
const actionId = (name) => {
  const entry = Object.entries(manifest.node).find(([, value]) => value.exportedName === name);
  if (!entry) throw new Error(`no server action called ${name} in the build`);
  return entry[0];
};

const BASE = process.argv[2] ?? "http://127.0.0.1:3070";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUB || !SECRET) throw new Error("missing Supabase env");
const ORG = 1;
const service = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `GapsVerify${stamp}x`;
const people = {};
const made = { batches: [], courseId: null, mocks: [], objects: [], sections: [] };
const tag = stamp.toString(36).slice(-5);
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
  const email = `gaps-${key}-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  const { error: pe } = await service.from("profiles").insert({ email, id: data.user.id, name: `Gaps ${key} ${stamp}`, org_id: ORG, role });
  if (pe) throw pe;
  people[key] = { email, id: data.user.id, name: `Gaps ${key} ${stamp}`, ...(await signIn(email)) };
}
async function get(path, key, headers = {}) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie: key ? people[key].cookie : "", ...headers }, redirect: "manual" });
  return { body: (await r.text()).replaceAll("<!-- -->", ""), location: r.headers.get("location") ?? "", status: r.status };
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
// Every value a form would post as rendered, as mock-import.mjs reads them.
function formValues(formHtml) {
  const fields = [];
  for (const t of formHtml.matchAll(/<input [^>]*>/g)) {
    const name = t[0].match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    const type = t[0].match(/type="([^"]*)"/)?.[1] ?? "text";
    if ((type === "checkbox" || type === "radio") && !/ checked/.test(t[0])) continue;
    if (type === "submit" || type === "file") continue;
    fields.push([decode(name), decode(t[0].match(/value="([^"]*)"/)?.[1] ?? (type === "checkbox" ? "on" : ""))]);
  }
  for (const a of formHtml.matchAll(/<textarea [^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/textarea>/g)) fields.push([decode(a[1]), decode(a[2])]);
  for (const sel of formHtml.matchAll(/<select [^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const chosen = sel[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/) ?? sel[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/) ?? sel[2].match(/<option[^>]*value="([^"]*)"/);
    fields.push([decode(sel[1]), decode(chosen?.[1] ?? "")]);
  }
  return fields;
}
async function postForm(path, key, formHtml, replace = []) {
  const body = new FormData();
  const replaced = new Set(replace.map(([n]) => n));
  for (const [k, v] of formValues(formHtml)) if (!replaced.has(k)) body.append(k, v);
  for (const [k, v] of replace) body.append(k, String(v));
  const r = await fetch(`${BASE}${path}`, { body, headers: { cookie: people[key].cookie, origin: BASE }, method: "POST", redirect: "manual" });
  return { body: await r.text(), location: r.headers.get("location") ?? "", status: r.status };
}
// A useActionState action, called as the browser calls it.
async function callAction(path, key, name, fields) {
  const formData = new FormData();
  for (const [k, v] of fields) formData.append(k, String(v));
  const initial = { defaultMarks: "", documentName: "", items: null, pasted: "", problems: [] };
  const r = await fetch(`${BASE}${path}`, {
    body: await encodeReply([initial, formData]),
    headers: { accept: "text/x-component", cookie: people[key].cookie, "next-action": actionId(name), origin: BASE },
    method: "POST",
    redirect: "manual",
  });
  await r.text();
  return r.headers.get("x-action-redirect") ?? r.headers.get("location") ?? "";
}
async function tableExists(table) {
  const { error } = await service.from(table).select("*").limit(1);
  return !error;
}
async function counts() {
  const out = {};
  const tables = ["profiles", "courses", "ars_rounds", "ars_submissions", "ars_process_runs", "content_access", "mocks", "questions", "question_imports", "question_sections"];
  if (await tableExists("activity_log")) tables.push("activity_log");
  for (const t of tables) out[t] = (await service.from(t).select("*", { count: "exact", head: true })).count;
  return out;
}

const baseline = await counts();
console.log("baseline", JSON.stringify(baseline));

try {
  await person("admin", "admin");
  await person("mentor", "mentor");
  await person("student", "student");
  await person("other", "student");

  // ---------------------------------------------------------------- fixtures
  const { data: course, error: ce } = await service.from("courses")
    .insert({ kind: "ars_process", org_id: ORG, title: `Gaps process ${stamp}` }).select("id").single();
  if (ce) throw ce;
  made.courseId = course.id;
  const { data: rounds, error: re } = await service.from("ars_rounds").insert([
    { config: { prompt: "Gaps written answer" }, course_id: course.id, name: `Gaps text ${stamp}`, org_id: ORG, requires_review: true, sort_order: 1, submission_mode: "text" },
    { config: { prompt: "Gaps upload" }, course_id: course.id, name: `Gaps file ${stamp}`, org_id: ORG, requires_review: true, sort_order: 2, submission_mode: "file" },
  ]).select("id, submission_mode");
  if (re) throw re;
  const textRound = rounds.find((r) => r.submission_mode === "text").id;
  const fileRound = rounds.find((r) => r.submission_mode === "file").id;
  for (const key of ["student", "other"]) {
    const { error } = await service.from("content_access").insert({ granted_by: people.admin.id, org_id: ORG, resource_id: course.id, resource_type: "course", student_id: people[key].id });
    if (error) throw error;
  }

  const answerText = `Gaps answer ${stamp}`;
  const { data: textSub, error: te } = await people.student.client.from("ars_submissions")
    .insert({ answer: { response: answerText }, org_id: ORG, round_id: textRound, status: "submitted", student_id: people.student.id })
    .select("id").single();
  if (te) throw te;

  const objectPath = `org/${ORG}/ars/${people.student.id}/${crypto.randomUUID()}.pdf`;
  const up = await people.student.client.storage.from("ars-uploads").upload(objectPath, new TextEncoder().encode("%PDF-1.4 gaps\n%%EOF\n"), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  made.objects.push(objectPath);
  const { data: fileSub, error: fe } = await people.student.client.from("ars_submissions")
    .insert({ answer: { upload: { mimeType: "application/pdf", originalName: "gaps.pdf", size: 20, storagePath: objectPath } }, org_id: ORG, round_id: fileRound, status: "draft", student_id: people.student.id })
    .select("id").single();
  if (fe) throw fe;

  // ------------------------------------------------- A. every ARS submission
  const list = await get("/admin/ars-submissions", "admin");
  check("the admin sees the submissions list with both fixture rows",
    list.status === 200 && list.body.includes(people.student.name) && list.body.includes(`Gaps text ${stamp}`),
    `${list.status}`);
  const byProcess = await get(`/admin/ars-submissions?process=${course.id}`, "admin");
  const processRows = (byProcess.body.match(/href="\/admin\/ars-submissions\/\d+"/g) ?? []).length;
  check("filtering by process shows exactly its two submissions", byProcess.status === 200 && processRows === 2, `rows=${processRows}`);
  const byRound = await get(`/admin/ars-submissions?process=${course.id}&round=${textRound}`, "admin");
  check("filtering by round narrows to that round",
    byRound.body.includes(`/admin/ars-submissions/${textSub.id}"`) && !byRound.body.includes(`/admin/ars-submissions/${fileSub.id}"`));
  const byStatus = await get(`/admin/ars-submissions?process=${course.id}&status=draft`, "admin");
  check("filtering by status narrows to drafts",
    byStatus.body.includes(`/admin/ars-submissions/${fileSub.id}"`) && !byStatus.body.includes(`/admin/ars-submissions/${textSub.id}"`));
  const junk = await get("/admin/ars-submissions?process=abc&status=nope&page=-1", "admin");
  check("junk filters still render the list", junk.status === 200);

  const textDetail = await get(`/admin/ars-submissions/${textSub.id}`, "admin");
  check("the admin opens a submitted answer", textDetail.status === 200 && textDetail.body.includes(answerText) && !textDetail.body.includes("Mark reviewed"));
  const fileDetail = await get(`/admin/ars-submissions/${fileSub.id}`, "admin");
  const signed = decode(fileDetail.body.match(/href="([^"]*\/storage\/v1\/object\/sign\/ars-uploads\/[^"]*)"/)?.[1] ?? "");
  let lifetime = null;
  try {
    const token = new globalThis.URL(signed).searchParams.get("token");
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    lifetime = claims.exp - claims.iat;
  } catch { /* reported below */ }
  check("the file opens through a signed URL of 5 to 15 minutes", fileDetail.status === 200 && lifetime !== null && lifetime >= 300 && lifetime <= 900, `lifetime=${lifetime}s`);
  const fetched = signed ? await fetch(signed) : null;
  check("the signed URL serves the file straight from storage", fetched?.status === 200 && !signed.startsWith(BASE), `${fetched?.status}`);

  for (const key of ["student", "mentor"]) {
    const home = key === "student" ? "/student" : "/mentor";
    const l = await get("/admin/ars-submissions", key);
    check(`the ${key} is refused the submissions list`, l.status === 307 && l.location.endsWith(home), `${l.status} ${l.location}`);
    const d = await get(`/admin/ars-submissions/${textSub.id}`, key);
    check(`the ${key} is refused a submission's admin page`, d.status === 307 && d.location.endsWith(home), `${d.status} ${d.location}`);
  }
  const anon = await get("/admin/ars-submissions", null);
  check("a signed-out visitor is sent to sign in", anon.status === 307 && anon.location.includes("/login"), anon.location);

  // ------------------------------------------------------ B. the activity log
  if (!(await tableExists("activity_log"))) {
    check("part B: activity_log exists (migration 20261008130000 applied)", false, "not applied; part B skipped");
  } else {
    for (const key of ["student", "mentor"]) {
      const home = key === "student" ? "/student" : "/mentor";
      const page = await get("/admin/activity", key);
      check(`the ${key} is refused the activity screen`, page.status === 307 && page.location.endsWith(home), `${page.status} ${page.location}`);
    }

    // Crafted rows, written as the server writes them.
    const t0 = Date.now() - 60 * 60_000;
    const at = (minutes) => new Date(t0 + minutes * 60_000).toISOString();
    const crafted = [
      // `other`: two sessions overlapping, from four addresses.
      ["other", "sign_in", "s-a", "198.51.100.1", 0], ["other", "active", "s-a", "198.51.100.2", 8],
      ["other", "sign_in", "s-b", "198.51.100.3", 5], ["other", "active", "s-b", "198.51.100.4", 12],
      // `student`: one session, one address, signed out, then a new one.
      ["student", "sign_in", "s-c", "203.0.113.5", 0], ["student", "sign_out", "s-c", "203.0.113.5", 4],
      ["student", "sign_in", "s-d", "203.0.113.5", 6], ["student", "active", "s-d", "203.0.113.5", 16],
    ].map(([key, event_type, session, ip, minutes]) => ({ event_type, ip, meta: { session_id: session }, occurred_at: at(minutes), org_id: ORG, user_id: people[key].id }));
    const ins = await service.from("activity_log").insert(crafted);
    check("crafted activity rows are written with the server key", !ins.error, ins.error?.message);

    const screen = await get("/admin/activity", "admin");
    const flagsPart = screen.body.split("Sign-ins and sign-outs")[0] ?? "";
    const otherFlags = flagsPart.split(people.other.name).length - 1;
    check("the admin's screen flags concurrent sessions and several locations",
      screen.status === 200 && otherFlags === 2 && flagsPart.includes("Concurrent sessions") && flagsPart.includes("Several locations"), `${screen.status} flagged rows for other=${otherFlags}`);
    check("one session at a time from one address is not flagged", !flagsPart.includes(people.student.name));

    // Refusals: nobody but an admin reads, nobody through the API writes.
    const studentRead = await people.student.client.from("activity_log").select("id").eq("user_id", people.student.id);
    check("a student cannot read the log, even their own rows", !studentRead.error && studentRead.data.length === 0, studentRead.error?.message);
    const mentorRead = await people.mentor.client.from("activity_log").select("id");
    check("a mentor cannot read the log", !mentorRead.error && mentorRead.data.length === 0, mentorRead.error?.message);
    const adminRead = await people.admin.client.from("activity_log").select("id").eq("user_id", people.other.id);
    check("an admin reads the log through their own session", !adminRead.error && adminRead.data.length === 4, `${adminRead.data?.length}`);

    const before = (await service.from("activity_log").select("*", { count: "exact", head: true }).in("user_id", [people.student.id, people.other.id])).count;
    const forged = await people.student.client.from("activity_log").insert({ event_type: "sign_in", ip: "192.0.2.1", meta: {}, org_id: ORG, user_id: people.other.id });
    check("a student cannot insert a row about someone else", Boolean(forged.error), forged.error?.message ?? "insert accepted");
    const own = await people.student.client.from("activity_log").insert({ event_type: "sign_in", ip: "192.0.2.1", meta: {}, org_id: ORG, user_id: people.student.id });
    check("a student cannot insert a row about themselves", Boolean(own.error), own.error?.message ?? "insert accepted");
    const viaRpc = await people.student.client.rpc("record_activity", { p_event_type: "sign_in", p_ip: "192.0.2.1", p_meta: {}, p_user_id: people.student.id });
    check("a student cannot call record_activity", Boolean(viaRpc.error), viaRpc.error?.message ?? "call accepted");
    const erase = await people.student.client.from("activity_log").delete().eq("user_id", people.student.id);
    const rewrite = await people.student.client.from("activity_log").update({ ip: "192.0.2.9" }).eq("user_id", people.student.id);
    const afterCount = (await service.from("activity_log").select("*", { count: "exact", head: true }).in("user_id", [people.student.id, people.other.id])).count;
    const rewritten = (await service.from("activity_log").select("id").eq("user_id", people.student.id).eq("ip", "192.0.2.9")).data ?? [];
    check("a student cannot delete or rewrite rows", afterCount === before && rewritten.length === 0, `delete=${erase.error?.code ?? "ok"} update=${rewrite.error?.code ?? "ok"} count ${before}->${afterCount}`);

    // The real write paths: signing in through the application's own form,
    // and a signed-in page view.
    const login = await get("/login", null);
    const form = login.body.match(/<form[\s\S]*?<\/form>/)?.[0] ?? "";
    const body = new FormData();
    for (const m of form.matchAll(/<input [^>]*>/g)) {
      if (!/type="hidden"/.test(m[0])) continue;
      const n = m[0].match(/name="([^"]*)"/)?.[1];
      if (n) body.append(decode(n), decode(m[0].match(/value="([^"]*)"/)?.[1] ?? ""));
    }
    body.append("email", people.mentor.email);
    body.append("password", password);
    const posted = await fetch(`${BASE}/login`, { body, headers: { origin: BASE, "x-forwarded-for": "198.51.100.77, 10.0.0.1" }, method: "POST", redirect: "manual" });
    await sleep(2500);
    const signIns = (await service.from("activity_log").select("ip, meta").eq("user_id", people.mentor.id).eq("event_type", "sign_in")).data ?? [];
    check("signing in through the application records a sign_in row with the address and session",
      signIns.length === 1 && signIns[0].ip === "198.51.100.77" && typeof signIns[0].meta?.session_id === "string",
      `status=${posted.status} rows=${JSON.stringify(signIns)}`);

    await get("/admin/users", "admin", { "x-forwarded-for": "198.51.100.88" });
    await get("/admin/users", "admin", { "x-forwarded-for": "198.51.100.88" });
    await sleep(2500);
    const actives = (await service.from("activity_log").select("ip").eq("user_id", people.admin.id).eq("event_type", "active").eq("ip", "198.51.100.88")).data ?? [];
    check("two page views from one address record one throttled active row", actives.length === 1, JSON.stringify(actives));
  }

  // --------------------------------------- C. D8: import from an aptitude round
  const { data: aptitude, error: ae } = await service.from("ars_rounds").insert({
    config: { pendingFeature: "test-engine", prompt: "Gaps aptitude", test: { durationMinutes: 10, questions: 1 } },
    course_id: course.id, name: `Gaps aptitude ${stamp}`, org_id: ORG, requires_review: false, sort_order: 3, submission_mode: "offline",
  }).select("id").single();
  if (ae) throw ae;
  const builder = await get(`/admin/ars/${course.id}/rounds/${aptitude.id}`, "admin");
  check("the aptitude round offers to import a paper for it", builder.status === 200 && builder.body.includes(`/admin/mocks/import-paper?round=${aptitude.id}`), `${builder.status}`);
  const wizard = await get(`/admin/mocks/import-paper?round=${aptitude.id}`, "admin");
  check("the importer opened from the round names it", wizard.status === 200 && wizard.body.includes(`Gaps aptitude ${stamp}`), `${wizard.status}`);

  const sectionName = `Gaps QA ${stamp}`;
  const { data: qa, error: qe } = await service.from("question_sections").insert({ name: sectionName, org_id: ORG }).select("id").single();
  if (qe) throw qe;
  made.sections.push(qa.id);
  const paper = { document: `Gaps paper ${stamp}`, questions: [
    { answer: "B", difficulty: "easy", options: ["3", "4", "5", "6"], question: `A gardener plants ninety-two saplings in rows of twenty-three. How many rows result? #${tag}`, section: sectionName, topic: "Division", type: "mcq" },
  ] };
  const stageFields = (roundId) => [["pasted", JSON.stringify(paper)], ["documentName", paper.document], ["defaultMarks", "1"], ["paperSection", ""], ["defaultDifficulty", ""], ["buildMock", "1"], ["roundId", String(roundId)]];

  // Refused: a round that is not off-platform is never marked.
  const textBefore = JSON.stringify((await service.from("ars_rounds").select("config").eq("id", textRound).single()).data?.config);
  const refusedAt = await callAction("/admin/mocks/import-paper", "admin", "stageQuestionImportAction", stageFields(textRound));
  const refusedBatch = refusedAt.match(/import\/([0-9a-f-]{36})/)?.[1];
  if (refusedBatch) made.batches.push(refusedBatch);
  const textAfter = JSON.stringify((await service.from("ars_rounds").select("config").eq("id", textRound).single()).data?.config);
  check("a round that is not off-platform is refused and left untouched", refusedAt.includes("roundLink=refused") && textAfter === textBefore, refusedAt);

  const stagedAt = await callAction("/admin/mocks/import-paper", "admin", "stageQuestionImportAction", stageFields(aptitude.id));
  const batchId = stagedAt.match(/import\/([0-9a-f-]{36})/)?.[1];
  if (batchId) made.batches.push(batchId);
  const marked = (await service.from("ars_rounds").select("config").eq("id", aptitude.id).single()).data?.config ?? {};
  check("staging from the round marks it with the import", Boolean(batchId) && marked.importBatchId === batchId && !stagedAt.includes("refused"), stagedAt);

  // The review's own forms drop the round from the URL; the mark carries it.
  let review = await get(`/admin/questions/import/${batchId}`, "admin");
  const approve = forms(review.body).find((f) => f.includes("Approve all clean"));
  if (!approve) throw new Error("no approve-all form");
  await postForm(`/admin/questions/import/${batchId}`, "admin", approve);
  review = await get(`/admin/questions/import/${batchId}`, "admin");
  check("the review, reopened without the round in its URL, still names it", review.body.includes(`Gaps aptitude ${stamp}`) && review.body.includes("linked to the ARS round"));
  const buildForm = forms(review.body).find((f) => f.includes(`$ACTION_ID_${actionId("buildMockFromImportAction")}`));
  if (!buildForm) throw new Error("no build form");
  check("the build step offers the round's process for access", formValues(buildForm).some(([k, v]) => k === "grantCourseId" && v === String(course.id)));
  const built = await postForm(`/admin/questions/import/${batchId}`, "admin", buildForm, [["title", `Gaps mock ${stamp}`], ["durationMinutes", "10"]]);
  const mockId = Number(built.location.match(/\/admin\/mocks\/(\d+)/)?.[1] ?? 0);
  if (mockId) made.mocks.push(mockId);
  const linked = (await service.from("ars_rounds").select("config").eq("id", aptitude.id).single()).data?.config ?? {};
  check("building the mock links it to the round and clears the mark",
    mockId > 0 && built.location.includes("notice=built-linked") && linked.mockId === mockId && !("importBatchId" in linked) && !("pendingFeature" in linked),
    `${built.location} ${JSON.stringify(linked)}`);
} catch (error) {
  check("run completed without throwing", false, String(error?.message ?? error));
} finally {
  const report = (what, { error }) => { if (error) console.log(`cleanup: ${what} not deleted: ${error.message}`); };
  if (made.mocks.length) {
    report("mock grants", await service.from("content_access").delete().eq("resource_type", "mock").in("resource_id", made.mocks));
    report("mocks", await service.from("mocks").delete().in("id", made.mocks));
  }
  if (made.batches.length) report("imports", await service.from("question_imports").delete().in("batch_id", made.batches));
  const { data: ours } = await service.from("questions").select("id").eq("org_id", ORG).like("body", `%#${tag}%`);
  for (const row of ours ?? []) {
    report("question key", await service.from("question_keys").delete().eq("question_id", row.id));
    report("question", await service.from("questions").delete().eq("id", row.id));
  }
  if (made.sections.length) report("sections", await service.from("question_sections").delete().in("id", made.sections));
  if (made.objects.length) report("objects", await service.storage.from("ars-uploads").remove(made.objects));
  if (made.courseId) {
    const { data: mine } = await service.from("ars_rounds").select("id").eq("course_id", made.courseId);
    for (const row of mine ?? []) report("submissions", await service.from("ars_submissions").delete().eq("round_id", row.id));
    report("runs", await service.from("ars_process_runs").delete().eq("course_id", made.courseId));
    report("rounds", await service.from("ars_rounds").delete().eq("course_id", made.courseId));
    report("grants", await service.from("content_access").delete().eq("resource_type", "course").eq("resource_id", made.courseId));
    report("course", await service.from("courses").delete().eq("id", made.courseId));
  }
  // activity_log rows go with their profile (ON DELETE CASCADE).
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
