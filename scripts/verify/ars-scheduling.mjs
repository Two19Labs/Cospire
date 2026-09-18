// Phase 5a: proves what the 2026-09-16 meeting added to a round -- opening and
// due dates, whether a mentor reviews it, and the `offline` mode for an
// interview or group discussion that happens elsewhere.
//
// Same method and the same reason as ars-rounds.mjs: throwaway accounts, real
// session cookies, every form posted through the no-JavaScript path, and the
// database asked for ground truth rather than a success redirect believed.
//
// One check here reads the SERVED stylesheet rather than the source, because
// this project has already shipped a font that downloaded on every page and
// rendered nowhere: the source said one thing and the served CSS another.
//
// node --env-file=.env.local scripts/verify/ars-scheduling.mjs <baseUrl>

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
const stamp = Date.now();
const PASSWORD = `SchedVerify${stamp}x`;
const COURSE = `Verify Scheduling Programme ${stamp}`;

const people = {};
let courseId = null;

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
  const email = `sched-verify-${key.toLowerCase()}-${stamp}@example.com`;
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
    name: `Sched Verify ${key}`,
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
  return { status: res.status, body: await res.text() };
}

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

async function round(name) {
  const { data } = await admin
    .from("ars_rounds")
    .select("id, name, submission_mode, opens_at, due_at, requires_review")
    .eq("course_id", courseId)
    .eq("name", name);
  return (data ?? [])[0] ?? null;
}

try {
  await createPerson("admin", "admin", COSPIRE_ORG);

  const { data: made } = await admin
    .from("courses")
    .insert({ org_id: COSPIRE_ORG, title: COURSE })
    .select("id")
    .single();
  courseId = made.id;

  const path = `/admin/courses/${courseId}`;
  const page = await get(path, "admin");
  record("admin opens the programme", page.status === 200, `${page.status}`);

  const createId = actionIdForFormWith(page.body, "submissionMode");
  record("the add-a-round form still works without JavaScript", Boolean(createId));
  if (!createId) throw new Error("no create action id");

  // ------------------------------------------------------------- the form
  record("the form offers the off-platform mode",
    page.body.includes("it happens on a call"),
    page.body.includes("it happens on a call") ? "option present" : "missing");

  record("the form offers both dates and the review tick",
    page.body.includes('name="opensAt"')
      && page.body.includes('name="dueAt"')
      && page.body.includes('name="requiresReview"'));

  // ------------------------------------------------------------- A. dates
  await postForm(path, "admin", createId, {
    courseId, name: "Dated round", submissionMode: "text",
    prompt: "Do the thing.", fields: "",
    opensAt: "2026-10-01", dueAt: "2026-10-09", requiresReview: "on",
  });
  let row = await round("Dated round");
  record("an opening date is stored as the START of that day in IST",
    row?.opens_at === "2026-09-30T18:30:00+00:00",
    `${row?.opens_at}`);
  record("a deadline is stored as the END of that day, not its start",
    row?.due_at === "2026-10-09T18:29:59+00:00",
    `${row?.due_at}`);

  const after = await get(path, "admin");
  record("the dates are shown back as the days the admin typed",
    after.body.includes("2026-10-01") && after.body.includes("2026-10-09"),
    "table shows 2026-10-01 and 2026-10-09");

  await postForm(path, "admin", createId, {
    courseId, name: "Undated round", submissionMode: "text",
    prompt: "Whenever.", fields: "", opensAt: "", dueAt: "", requiresReview: "on",
  });
  row = await round("Undated round");
  record("a round with no dates stores nulls",
    row !== null && row.opens_at === null && row.due_at === null);

  // -------------------------------------------------------- B. rejections
  const backwards = await postForm(path, "admin", createId, {
    courseId, name: "Backwards round", submissionMode: "text",
    prompt: "x", fields: "", opensAt: "2026-10-09", dueAt: "2026-10-01",
    requiresReview: "on",
  });
  record("a deadline before the opening date is refused, and creates nothing",
    (await round("Backwards round")) === null
      && (backwards.location ?? "").includes("dates-invalid"),
    `-> ${backwards.location}`);

  const malformed = await postForm(path, "admin", createId, {
    courseId, name: "Malformed date round", submissionMode: "text",
    prompt: "x", fields: "", opensAt: "01/10/2026", dueAt: "", requiresReview: "on",
  });
  record("a date that is not a day is refused, and creates nothing",
    (await round("Malformed date round")) === null
      && (malformed.location ?? "").includes("dates-invalid"),
    `-> ${malformed.location}`);

  // ------------------------------------------------------------ C. review
  await postForm(path, "admin", createId, {
    courseId, name: "Application round", submissionMode: "form",
    prompt: "Fill it in as you would for real.", fields: "Why this school?",
    opensAt: "", dueAt: "",
    // requiresReview deliberately absent: an unticked checkbox sends nothing.
  });
  row = await round("Application round");
  record("an unticked review box means nobody reviews it",
    row?.requires_review === false, `requires_review=${row?.requires_review}`);

  const withReview = await get(path, "admin");
  record("the table says so, in words an admin can read",
    withReview.body.includes("no mentor review"));

  // ----------------------------------------------------------- D. offline
  await postForm(path, "admin", createId, {
    courseId, name: "Interview", submissionMode: "offline",
    prompt: "Held on a call. Your mentor records the outcome.", fields: "",
    opensAt: "2026-10-12", dueAt: "2026-10-12", requiresReview: "on",
  });
  row = await round("Interview");
  record("an off-platform round can be authored",
    row?.submission_mode === "offline", `mode=${row?.submission_mode}`);

  // ------------------------------------------------------- E. served CSS
  const cssHref = page.body.match(/href="([^"]*\.css[^"]*)"/)?.[1];
  if (cssHref) {
    const css = await fetch(`${BASE}${cssHref.replace(/&amp;/g, "&")}`).then((r) => r.text());
    record("the classes the round form uses exist in the SERVED stylesheet",
      css.includes(".field-row") && css.includes(".choice") && css.includes(".stack-form"),
      "field-row, choice, stack-form");
    record("the date pair collapses to one column on a phone",
      css.includes("auto-fit") && css.includes("minmax(11rem"));
  } else {
    record("stylesheet found on the page", false, "no css link in HTML");
  }
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  // Cleanup, scoped to what this run created. Never "everything currently here":
  // that is the teardown near-miss of 2026-09-08.
  if (courseId) {
    await admin.from("ars_rounds").delete().eq("course_id", courseId);
    await admin.from("courses").delete().eq("id", courseId);
  }
  for (const person of Object.values(people)) {
    await admin.auth.admin.deleteUser(person.id);
  }

  const counts = {};
  for (const table of ["courses", "ars_rounds", "profiles", "ars_submissions"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
