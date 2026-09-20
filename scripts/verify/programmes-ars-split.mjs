// Programmes and ARS are separate sections now. This proves it, and proves the
// thing that nearly went wrong on the way.
//
// `courses` carried both a learning programme and an admission-readiness
// process until 2026-09-20, distinguished only by whether anyone had hung ARS
// rounds off it. `courses.kind` separates them. The risk in doing that is not
// the column -- it is that the two screens share one table, one create action
// and one granting action, so a mistake sends an admin to the wrong section or,
// worse, leaves a section with no way to create or grant anything at all. An
// earlier attempt did exactly that: it made Programmes a placeholder while ARS
// still could not create a process, which closed the flow completely.
//
// So the checks that matter here are: each list shows only its own kind, each
// section can create its own rows, each can grant a student, each returns to
// itself afterwards, and a row can be moved between them.
//
// node --env-file=.env.local scripts/verify/programmes-ars-split.mjs <baseUrl>

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
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
const stamp = Date.now();
const PASSWORD = `SplitVerify${stamp}x`;
const PROGRAMME = `Split Programme ${stamp}`;
const PROCESS = `Split Process ${stamp}`;

const people = {};
const created = [];

async function signIn(email) {
  const jar = [];
  const ssr = createServerClient(URL_, PUB, {
    cookies: { getAll: () => [], setAll: (list) => jar.push(...list) },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return jar.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function createPerson(key, role) {
  const email = `split-${key}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await admin
    .from("profiles")
    .insert({ email, id: data.user.id, name: `Split ${key}`, org_id: COSPIRE_ORG, role });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { cookie: await signIn(email), id: data.user.id };
}

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { cookie: people[who].cookie } : {},
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

function formWith(html, fieldName, value) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!form[0].includes(`name="${fieldName}"`)) continue;
    if (value !== undefined && !form[0].includes(`value="${value}"`)) continue;
    return form[0];
  }
  return null;
}

function decodeEntities(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function hiddenFields(formHtml) {
  const fields = {};
  for (const tag of formHtml.matchAll(/<input [^>]*>/g)) {
    if (!/type="hidden"/.test(tag[0])) continue;
    const name = tag[0].match(/name="([^"]*)"/)?.[1];
    if (!name) continue;
    fields[decodeEntities(name)] = decodeEntities(tag[0].match(/value="([^"]*)"/)?.[1] ?? "");
  }
  return fields;
}

async function postForm(path, who, formHtml, fields) {
  const body = new FormData();
  for (const [k, v] of Object.entries(hiddenFields(formHtml))) body.set(k, v);
  for (const [k, v] of Object.entries(fields)) body.set(k, String(v));
  const res = await fetch(`${BASE}${path}`, {
    body,
    headers: { cookie: people[who].cookie, origin: BASE },
    method: "POST",
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

async function courseByTitle(title) {
  const { data } = await admin.from("courses").select("id, title, kind").eq("title", title);
  return (data ?? [])[0] ?? null;
}

try {
  await createPerson("admin", "admin");
  await createPerson("student", "student");

  // ------------------------------------------------ A. each section creates
  const programmesPage = await get("/admin/courses", "admin");
  record("the Programmes screen loads", programmesPage.status === 200, `${programmesPage.status}`);
  record(
    "and says what the section is for, with both placeholders marked unbuilt",
    programmesPage.body.includes("Aptitude preparation") &&
      programmesPage.body.includes("Video curriculums") &&
      programmesPage.body.includes("Not built yet"),
  );

  const programmeForm = formWith(programmesPage.body, "kind", "programme");
  record("the Programmes create form still exists and declares its kind", Boolean(programmeForm));
  if (!programmeForm) throw new Error("no programme create form");

  const madeProgramme = await postForm("/admin/courses", "admin", programmeForm, {
    title: PROGRAMME,
  });
  const programme = await courseByTitle(PROGRAMME);
  if (programme) created.push(programme.id);
  record(
    "creating from Programmes makes a programme and lands on its own detail page",
    programme?.kind === "programme" &&
      (madeProgramme.location ?? "").startsWith(`/admin/courses/${programme?.id}`),
    `kind=${programme?.kind} -> ${madeProgramme.location}`,
  );

  const arsPage = await get("/admin/ars", "admin");
  record("the ARS screen loads", arsPage.status === 200, `${arsPage.status}`);

  const processForm = formWith(arsPage.body, "kind", "ars_process");
  record("**ARS can now create its own process**", Boolean(processForm));
  if (!processForm) throw new Error("no process create form");

  const madeProcess = await postForm("/admin/ars", "admin", processForm, { title: PROCESS });
  const process = await courseByTitle(PROCESS);
  if (process) created.push(process.id);
  record(
    "creating from ARS makes an ars_process and lands in the ARS section, not Programmes",
    process?.kind === "ars_process" &&
      (madeProcess.location ?? "").startsWith(`/admin/ars/${process?.id}`),
    `kind=${process?.kind} -> ${madeProcess.location}`,
  );

  // -------------------------------------------- B. neither list shows the other
  const programmesAfter = await get("/admin/courses", "admin");
  record(
    "the Programmes list shows the programme and NOT the process",
    programmesAfter.body.includes(PROGRAMME) && !programmesAfter.body.includes(PROCESS),
  );

  const arsAfter = await get("/admin/ars", "admin");
  record(
    "the ARS list shows the process and NOT the programme",
    arsAfter.body.includes(PROCESS) && !arsAfter.body.includes(PROGRAMME),
  );

  // ------------------------------------------------- C. granting, in both
  const processDetail = await get(`/admin/ars/${process.id}`, "admin");
  record(
    "the ARS process page carries the student list",
    processDetail.status === 200 && processDetail.body.includes("Students"),
    `${processDetail.status}`,
  );

  const grantForm = formWith(processDetail.body, "studentId", people.student.id);
  record("**ARS can now grant a student its process**", Boolean(grantForm));
  if (grantForm) {
    const granted = await postForm(`/admin/ars/${process.id}`, "admin", grantForm, {});
    const { data: access } = await admin
      .from("content_access")
      .select("id")
      .eq("resource_type", "course")
      .eq("resource_id", process.id)
      .eq("student_id", people.student.id);
    record(
      "the grant is written, and the admin stays in the ARS section",
      (access ?? []).length === 1 && (granted.location ?? "").startsWith(`/admin/ars/${process.id}`),
      `${(access ?? []).length} row -> ${granted.location}`,
    );
  }

  const programmeDetail = await get(`/admin/courses/${programme.id}`, "admin");
  const programmeGrant = formWith(programmeDetail.body, "studentId", people.student.id);
  record("granting still works from Programmes too", Boolean(programmeGrant));
  if (programmeGrant) {
    const granted = await postForm(`/admin/courses/${programme.id}`, "admin", programmeGrant, {});
    record(
      "and it returns to Programmes rather than bouncing into ARS",
      (granted.location ?? "").startsWith(`/admin/courses/${programme.id}`),
      `-> ${granted.location}`,
    );
  }

  // --------------------------------------------------- D. the way back out
  //
  // The backfill classified every existing row by one rule. A rule that good is
  // still a rule that can be wrong about a particular row, and without this a
  // wrong answer would be permanent.
  const moveForm = formWith(processDetail.body, "target", "programme");
  record("a process offers a way back to Programmes", Boolean(moveForm));
  if (moveForm) {
    const moved = await postForm(`/admin/ars/${process.id}`, "admin", moveForm, {});
    const after = await courseByTitle(PROCESS);
    record(
      "moving it changes its kind and lands it in the other section",
      after?.kind === "programme" &&
        (moved.location ?? "").startsWith(`/admin/courses/${process.id}`),
      `kind=${after?.kind} -> ${moved.location}`,
    );

    const backInProgrammes = await get("/admin/courses", "admin");
    record("and it now appears under Programmes", backInProgrammes.body.includes(PROCESS));

    // Put it back, so the last checks run against a process again.
    const detailNow = await get(`/admin/courses/${process.id}`, "admin");
    const moveBack = formWith(detailNow.body, "target", "ars_process");
    if (moveBack) await postForm(`/admin/courses/${process.id}`, "admin", moveBack, {});
    const restored = await courseByTitle(PROCESS);
    record("and it can be moved back", restored?.kind === "ars_process", `kind=${restored?.kind}`);
  }

  // ------------------------------------------------------- E. the student
  //
  // A process with no rounds has nothing for a student to work through, so it
  // needs one before this means anything. Granting through the ARS section has
  // to give real access, or the section is decorative.
  await admin.from("ars_rounds").insert({
    config: { prompt: "Write about a decision you would now make differently." },
    course_id: process.id,
    name: "Written answer",
    org_id: COSPIRE_ORG,
    requires_review: true,
    submission_mode: "text",
  });

  const studentView = await get("/student/ars", "student");
  record(
    "the student granted through ARS can reach the process and its round",
    studentView.status === 200 &&
      studentView.body.includes(PROCESS) &&
      studentView.body.includes("Written answer"),
    `${studentView.status}`,
  );
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  for (const id of created) {
    await admin.from("ars_rounds").delete().eq("course_id", id);
    await admin.from("content_access").delete().eq("resource_type", "course").eq("resource_id", id);
    await admin.from("courses").delete().eq("id", id);
  }
  for (const person of Object.values(people)) {
    const { error } = await admin.auth.admin.deleteUser(person.id);
    if (error) console.log(`  cleanup could not remove ${person.id}: ${error.message}`);
  }

  const counts = {};
  for (const table of ["courses", "ars_rounds", "content_access", "profiles"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
