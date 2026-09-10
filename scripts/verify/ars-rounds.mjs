// Phase 5a step 2: proves the ARS round authoring screens against a running
// application and the hosted database.
//
// Same method and the same reason as courses.mjs: a green build is not evidence
// here, because this codebase has twice shipped a Server Action that typecheck,
// lint, tests and a build all accepted while it wrote nothing.
//
// The mentor half of this feature is checked at the database instead of here.
// `courses_select_mentor` and the mentor branch of `ars_rounds_select_authorized`
// are real and tested by rolled-back SQL probes, but no mentor route renders a
// round yet -- that is step 5 -- so there is nothing to drive over HTTP. What is
// checked here is that a mentor cannot *write* one.
//
// node --env-file=.env.local scripts/verify/ars-rounds.mjs <baseUrl>

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const admin = createClient(URL_, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

const COSPIRE_ORG = 1;
const RIVAL_ORG = 5;
const stamp = Date.now();
const PASSWORD = `RoundsVerify${stamp}x`;
const COURSE = `Verify Rounds Programme ${stamp}`;

const people = {};
let courseId = null;
let rivalCourseId = null;

async function signIn(email) {
  const jar = [];
  const client = createServerClient(URL_, PUB, {
    cookies: { getAll: () => [], setAll: (list) => jar.push(...list) },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return jar.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function createPerson(key, role, org) {
  const email = `rounds-verify-${key.toLowerCase()}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`create ${email}: ${error.message}`);

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    org_id: org,
    role,
    name: `Rounds Verify ${key}`,
    email,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`profile ${email}: ${profileError.message}`);
  }

  people[key] = { id: data.user.id, cookie: await signIn(email) };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { cookie: people[who].cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

// Each form is found by a field only it has. Taking the first action id on the
// page posts at the header's Sign out form, which is a convincing false failure.
function actionIdForFormWith(html, fieldName) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!form[0].includes(`name="${fieldName}"`)) continue;
    const id = form[0].match(/\$ACTION_ID_([a-f0-9]+)/);
    if (id) return id[1];
  }
  return null;
}

async function postForm(path, who, actionId, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
  form.set(`$ACTION_ID_${actionId}`, "");

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie: people[who].cookie },
    body: form,
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location") };
}

async function rounds(name) {
  const query = admin.from("ars_rounds").select("id, name, submission_mode, config, course_id, org_id");
  const { data } = name ? await query.eq("name", name) : await query.eq("course_id", courseId);
  return data ?? [];
}

try {
  for (const [key, role, org] of [
    ["admin", "admin", COSPIRE_ORG],
    ["student", "student", COSPIRE_ORG],
    ["mentor", "mentor", COSPIRE_ORG],
    ["rivalAdmin", "admin", RIVAL_ORG],
  ]) {
    await createPerson(key, role, org);
  }

  const { data: made } = await admin
    .from("courses")
    .insert({ org_id: COSPIRE_ORG, title: COURSE })
    .select("id")
    .single();
  courseId = made.id;

  const { data: rivalMade } = await admin
    .from("courses")
    .insert({ org_id: RIVAL_ORG, title: `${COURSE} rival` })
    .select("id")
    .single();
  rivalCourseId = rivalMade.id;

  const path = `/admin/courses/${courseId}`;
  const detail = await get(path, "admin");
  record("admin opens the programme with its rounds panel", detail.status === 200, `${detail.status}`);

  const createId = actionIdForFormWith(detail.body, "submissionMode");
  record("the add-a-round form renders without JavaScript", Boolean(createId),
    createId ? `${createId.slice(0, 12)}...` : "no action id in HTML");
  if (!createId) throw new Error("cannot continue without the create action id");

  // ------------------------------------------------------------ A. authoring
  await postForm(path, "admin", createId, {
    courseId, name: "Guesstimate", submissionMode: "text",
    prompt: "Estimate the number of taxis in Mumbai.", fields: "",
  });
  let rows = await rounds("Guesstimate");
  record("admin adds a text round",
    rows.length === 1 && rows[0].submission_mode === "text"
      && rows[0].config.prompt === "Estimate the number of taxis in Mumbai."
      && rows[0].config.fields === undefined,
    rows.length === 1 ? `config ${JSON.stringify(rows[0].config)}` : `${rows.length} rows`);

  await postForm(path, "admin", createId, {
    courseId, name: "Mock application", submissionMode: "form",
    prompt: "Answer as you would for the real thing.",
    fields: "Why this school?\n  What will you contribute?  \n\n",
  });
  rows = await rounds("Mock application");
  record("admin adds a form round, its questions parsed one per line",
    rows.length === 1
      && JSON.stringify(rows[0].config.fields) ===
         JSON.stringify([{ label: "Why this school?" }, { label: "What will you contribute?" }]),
    rows.length === 1 ? JSON.stringify(rows[0].config.fields) : `${rows.length} rows`);

  await postForm(path, "admin", createId, {
    courseId, name: "Video essay", submissionMode: "file",
    prompt: "Two minutes, talking to camera.", fields: "Ignored question",
  });
  rows = await rounds("Video essay");
  record("a file round stores no questions, even when some are typed",
    rows.length === 1 && rows[0].config.fields === undefined,
    rows.length === 1 ? JSON.stringify(rows[0].config) : `${rows.length} rows`);

  // ----------------------------------------------------------- B. rejections
  const noFields = await postForm(path, "admin", createId, {
    courseId, name: "Empty form", submissionMode: "form", prompt: "x", fields: "   \n  ",
  });
  record("a form round with no questions is refused, and creates nothing",
    (await rounds("Empty form")).length === 0 && (noFields.location ?? "").includes("fields-invalid"),
    `-> ${noFields.location}`);

  const dup = await postForm(path, "admin", createId, {
    courseId, name: "Guesstimate", submissionMode: "text", prompt: "x", fields: "",
  });
  record("a duplicate round name on one programme is refused",
    (await rounds("Guesstimate")).length === 1 && (dup.location ?? "").includes("duplicate-name"),
    `-> ${dup.location}`);

  const blank = await postForm(path, "admin", createId, {
    courseId, name: "  ", submissionMode: "text", prompt: "x", fields: "",
  });
  record("a blank round name is refused", (blank.location ?? "").includes("name-invalid"), `-> ${blank.location}`);

  const noPrompt = await postForm(path, "admin", createId, {
    courseId, name: "No instructions", submissionMode: "text", prompt: "   ", fields: "",
  });
  record("a round with no instructions is refused, and creates nothing",
    (await rounds("No instructions")).length === 0 && (noPrompt.location ?? "").includes("prompt-invalid"),
    `-> ${noPrompt.location}`);

  const badMode = await postForm(path, "admin", createId, {
    courseId, name: "Bad mode", submissionMode: "interpretive dance", prompt: "x", fields: "",
  });
  record("a hand-posted submission mode with no renderer is refused",
    (await rounds("Bad mode")).length === 0 && (badMode.location ?? "").includes("mode-invalid"),
    `-> ${badMode.location}`);

  // ---------------------------------------------------------- C. who may write
  for (const who of ["student", "mentor"]) {
    await postForm(path, who, createId, {
      courseId, name: `By a ${who}`, submissionMode: "text", prompt: "x", fields: "",
    });
    record(`a ${who} posting the create action writes nothing`,
      (await rounds(`By a ${who}`)).length === 0, "no ars_rounds row");
  }

  await postForm(path, "rivalAdmin", createId, {
    courseId, name: "By a rival admin", submissionMode: "text", prompt: "x", fields: "",
  });
  record("another organisation's admin cannot add a round here",
    (await rounds("By a rival admin")).length === 0, "no ars_rounds row");

  // A round hand-posted against a programme in the rival's own organisation
  // must not be written into this admin's org either.
  await postForm(`/admin/courses/${rivalCourseId}`, "admin", createId, {
    courseId: rivalCourseId, name: "Cross tenant", submissionMode: "text", prompt: "x", fields: "",
  });
  record("an admin cannot add a round to another organisation's programme",
    (await rounds("Cross tenant")).length === 0, "no ars_rounds row");

  // ------------------------------------------------------------- D. removing
  const after = await get(path, "admin");
  const deleteId = actionIdForFormWith(after.body, "roundId");
  record("the remove-round form renders without JavaScript", Boolean(deleteId),
    deleteId ? `${deleteId.slice(0, 12)}...` : "no action id in HTML");

  if (deleteId) {
    const victim = (await rounds("Video essay"))[0];

    await postForm(path, "student", deleteId, { courseId, roundId: victim.id });
    record("a student cannot remove a round", (await rounds("Video essay")).length === 1, "round still there");

    // The delete is scoped by course_id as well as id. Without that, a round id
    // belonging to a different programme would be deleted and the admin
    // returned to a page that looks unchanged.
    const wrongCourse = await postForm(
      `/admin/courses/${rivalCourseId}`, "admin", deleteId,
      { courseId: rivalCourseId, roundId: victim.id },
    );
    record("a round id posted against the wrong programme is refused",
      (await rounds("Video essay")).length === 1 && (wrongCourse.location ?? "").includes("delete-failed"),
      `-> ${wrongCourse.location}`);

    const removed = await postForm(path, "admin", deleteId, { courseId, roundId: victim.id });
    record("admin removes a round",
      (await rounds("Video essay")).length === 0 && (removed.location ?? "").includes("roundNotice=removed"),
      `-> ${removed.location}`);
  }

  // ---------------------------------------------- E. the programme cascade
  const before = (await rounds()).length;
  await admin.from("courses").delete().eq("id", courseId);
  const remaining = (await rounds()).length;
  courseId = null;
  record("deleting a programme takes its rounds with it",
    before > 0 && remaining === 0, `${before} before, ${remaining} after`);
} finally {
  // Scoped to what this run created.
  if (courseId) await admin.from("courses").delete().eq("id", courseId);
  if (rivalCourseId) await admin.from("courses").delete().eq("id", rivalCourseId);
  await admin.from("courses").delete().like("title", `${COURSE}%`);
  for (const [key, person] of Object.entries(people)) {
    const { error } = await admin.auth.admin.deleteUser(person.id);
    if (error) console.log(`could not remove ${key}: ${error.message}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log("failing:");
    for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
    process.exitCode = 1;
  }
}
