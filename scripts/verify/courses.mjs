// Phase 5a step 1: proves the programme screens against a running application
// and the hosted database.
//
// It exists because a green build is not evidence. The documents slice shipped
// a grant action that typecheck, lint, 58 unit tests and a production build all
// accepted while it silently wrote nothing, because an upsert on a table with
// no UPDATE policy is refused with 42501 and returns no error the caller looks
// at. The two actions here write to the same table by the same route.
//
// Self-contained on purpose: it creates its own accounts, drives the running
// app over HTTP with real session cookies, checks the database for ground truth
// rather than trusting a redirect, and removes only what it created.
//
// node --env-file=.env.local scripts/verify/courses.mjs <baseUrl>

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
const PASSWORD = `CoursesVerify${stamp}x`;
const TITLE = `Verify Programme ${stamp}`;

const people = {};

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
  const email = `courses-verify-${key.toLowerCase()}-${stamp}@example.com`;
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
    name: `Courses Verify ${key}`,
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

// The page carries several action forms. Taking the first id on the page posts
// at the Sign out form in the header, which is a convincing false failure, so
// each form is found by a field only it has.
function actionIdForFormWith(html, fieldName) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!form[0].includes(`name="${fieldName}"`)) continue;
    const id = form[0].match(/\$ACTION_ID_([a-f0-9]+)/);
    if (id) return id[1];
  }
  return null;
}

async function postForm(path, who, actionId, fields) {
  // multipart/form-data, matching the encType Next renders. This is the
  // no-JavaScript progressive-enhancement path exactly as a browser with
  // scripting disabled would submit it.
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

const createdCourseIds = [];

async function courseRows(title) {
  const { data } = await admin.from("courses").select("id, org_id, title, sort_order").eq("title", title);
  return data ?? [];
}

async function grantCount(courseId, studentId) {
  const { count } = await admin
    .from("content_access")
    .select("id", { count: "exact", head: true })
    .eq("resource_type", "course")
    .eq("resource_id", courseId)
    .eq("student_id", studentId);
  return count ?? 0;
}

try {
  for (const [key, role, org] of [
    ["admin", "admin", COSPIRE_ORG],
    ["studentA", "student", COSPIRE_ORG],
    ["studentB", "student", COSPIRE_ORG],
    ["mentor", "mentor", COSPIRE_ORG],
    ["rivalAdmin", "admin", RIVAL_ORG],
  ]) {
    await createPerson(key, role, org);
  }

  // ------------------------------------------------------------- A. guards
  for (const [name, path, who, expect] of [
    ["anonymous cannot reach the programme list", "/admin/courses", null, "/login"],
    ["student cannot reach the programme list", "/admin/courses", "studentA", "/student"],
    ["mentor cannot reach the programme list", "/admin/courses", "mentor", "/mentor"],
  ]) {
    const res = await get(path, who);
    const redirected = [302, 303, 307].includes(res.status);
    record(name, redirected && (res.location ?? "").includes(expect), `${res.status} -> ${res.location}`);
  }

  const list = await get("/admin/courses", "admin");
  record("admin reaches the programme list", list.status === 200, `${list.status}`);

  // Found by `title`, the only field unique to the create form. The GET search
  // form posts nothing and carries no action id; the header's Sign out form is
  // the one that would be picked by taking the first id on the page.
  const createActionId = actionIdForFormWith(list.body, "title");
  record("the create form renders without JavaScript", Boolean(createActionId),
    createActionId ? `${createActionId.slice(0, 12)}...` : "no action id in HTML");

  if (!createActionId) throw new Error("cannot continue without the create action id");

  // ------------------------------------------------------------ B. creating
  // Posted exactly as the form now renders it: a title and nothing else. The
  // ordering defaults to 0 rather than being asked for.
  const created = await postForm("/admin/courses", "admin", createActionId, {
    title: TITLE,
  });
  let rows = await courseRows(TITLE);
  if (rows[0]) createdCourseIds.push(rows[0].id);

  record("admin creates a programme, ordering defaulting to 0",
    rows.length === 1 && rows[0].sort_order === 0 && rows[0].org_id === COSPIRE_ORG,
    rows.length === 1 ? `id ${rows[0].id}, sort_order ${rows[0].sort_order}` : `${rows.length} rows; action said ${created.status}`);

  if (rows.length !== 1) throw new Error("cannot continue without a programme");
  const courseId = rows[0].id;

  const dup = await postForm("/admin/courses", "admin", createActionId, { title: TITLE });
  rows = await courseRows(TITLE);
  record("a duplicate name is refused, and creates nothing",
    rows.length === 1 && (dup.location ?? "").includes("duplicate-title"),
    `${rows.length} row(s); -> ${dup.location}`);

  const blank = await postForm("/admin/courses", "admin", createActionId, { title: "   " });
  record("a blank name is refused", (blank.location ?? "").includes("title-missing"), `-> ${blank.location}`);

  // The form no longer offers an ordering field, so this is a hand-posted one.
  // A Server Action is an HTTP endpoint: removing an input from the markup
  // removes it from the browser, not from the request an attacker can send.
  const badOrder = await postForm("/admin/courses", "admin", createActionId, {
    title: `${TITLE} bad order`,
    sortOrder: "12abc",
  });
  const badRows = await courseRows(`${TITLE} bad order`);
  record("a hand-posted ordering that is only partly a number is still refused",
    badRows.length === 0 && (badOrder.location ?? "").includes("sort-order-invalid"),
    `${badRows.length} row(s); -> ${badOrder.location}`);

  const studentCreate = await postForm("/admin/courses", "studentA", createActionId, {
    title: `${TITLE} by a student`,
  });
  const studentRows = await courseRows(`${TITLE} by a student`);
  record("a student posting the create action creates nothing",
    studentRows.length === 0, `${studentRows.length} row(s); ${studentCreate.status} -> ${studentCreate.location}`);

  // ------------------------------------------------------------ C. granting
  const detail = await get(`/admin/courses/${courseId}`, "admin");
  record("admin opens the programme detail", detail.status === 200, `${detail.status}`);

  const grantActionId = actionIdForFormWith(detail.body, "courseId");
  record("the grant form renders without JavaScript", Boolean(grantActionId),
    grantActionId ? `${grantActionId.slice(0, 12)}...` : "no action id in HTML");

  if (!grantActionId) throw new Error("cannot continue without the grant action id");

  const path = `/admin/courses/${courseId}`;

  await postForm(path, "admin", grantActionId, { courseId, studentId: people.studentA.id, intent: "grant" });
  record("admin puts a student on the programme", (await grantCount(courseId, people.studentA.id)) === 1, "content_access row present");

  await postForm(path, "studentB", grantActionId, { courseId, studentId: people.studentB.id, intent: "grant" });
  record("a student cannot put themselves on the programme", (await grantCount(courseId, people.studentB.id)) === 0, "no content_access row written");

  await postForm(path, "rivalAdmin", grantActionId, { courseId, studentId: people.studentA.id, intent: "grant" });
  record("another organisation's admin cannot grant this programme", (await grantCount(courseId, people.studentA.id)) === 1, "still exactly the one grant");

  await postForm(path, "mentor", grantActionId, { courseId, studentId: people.studentB.id, intent: "grant" });
  record("a mentor cannot grant a programme", (await grantCount(courseId, people.studentB.id)) === 0, "no content_access row written");

  const revoked = await postForm(path, "admin", grantActionId, { courseId, studentId: people.studentA.id, intent: "revoke" });
  record("admin removes a student from the programme",
    (await grantCount(courseId, people.studentA.id)) === 0, `-> ${revoked.location}`);

  const bogus = await postForm(path, "admin", grantActionId, { courseId, studentId: "not-a-uuid", intent: "grant" });
  record("a malformed student id is refused before the round trip",
    (bogus.location ?? "").includes("invalid-request"), `-> ${bogus.location}`);

  // ------------------------------------------------- D. the hand-written cascade
  await postForm(path, "admin", grantActionId, { courseId, studentId: people.studentA.id, intent: "grant" });
  const beforeDelete = await grantCount(courseId, people.studentA.id);
  await admin.from("courses").delete().eq("id", courseId);
  const afterDelete = await grantCount(courseId, people.studentA.id);
  createdCourseIds.length = 0;
  record("deleting a programme takes its grants with it",
    beforeDelete === 1 && afterDelete === 0, `${beforeDelete} grant before, ${afterDelete} after`);
} finally {
  // Scoped to what this run created. The teardown that deleted every row in a
  // table is the bug this harness already learned once.
  for (const id of createdCourseIds) {
    await admin.from("content_access").delete().eq("resource_type", "course").eq("resource_id", id);
    await admin.from("courses").delete().eq("id", id);
  }
  await admin.from("courses").delete().like("title", `${TITLE}%`);
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
