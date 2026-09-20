// Phase 5a: proves the paste-to-build process importer against a running
// application and the hosted database.
//
// Same method and the same reason as ars-scheduling.mjs: throwaway accounts,
// real session cookies, every form posted through the no-JavaScript path, and
// the database asked for ground truth rather than a success redirect believed.
//
// The checks that matter most here are the ones about what is NOT written:
// reading a paste must touch nothing, a bad paste must create nothing, and an
// import must refuse to destroy a round a student has already answered. An
// importer that replaces a process is the most destructive control an admin has
// in this application, and it went in on the day it was demonstrated.
//
// node --env-file=.env.local scripts/verify/ars-import.mjs <baseUrl>

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
const PASSWORD = `ImportVerify${stamp}x`;
const COURSE = `Verify Import Programme ${stamp}`;

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
  const email = `import-verify-${key.toLowerCase()}-${stamp}@example.com`;
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
    name: `Import Verify ${key}`,
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
  return { status: res.status, body: await res.text(), location: res.headers.get("location") };
}

// A form that `useActionState` rendered does not carry a `$ACTION_ID_` field
// like the plain `action={serverAction}` forms the other scripts drive. It
// carries `$ACTION_REF_n`, a bound-arguments pair and an `$ACTION_KEY`, and the
// no-JavaScript path is the browser posting all of them back verbatim.
//
// So this replays whatever hidden fields the server rendered, rather than
// recognising one shape. That is also the honest test: if the fields React
// emitted are not enough to drive the form without scripting, this fails.
function formWith(html, fieldName) {
  for (const form of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (form[0].includes(`name="${fieldName}"`)) return form[0];
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

// Posts the form the way a browser with scripting switched off would: every
// hidden field the server rendered, then the values a person typed.
async function postForm(path, who, formHtml, fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(hiddenFields(formHtml))) form.set(k, v);
  for (const [k, v] of Object.entries(fields)) form.set(k, String(v));

  // `origin` matters: Next.js refuses a Server Action whose request carries no
  // Origin header, as a cross-site-request defence, and answers 500 with
  // "Failed to find Server Action" -- which reads like a build mismatch and
  // sends you looking in the wrong place entirely. A browser always sends it.
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie: people[who].cookie, origin: BASE },
    body: form,
    redirect: "manual",
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    body: await res.text(),
  };
}

async function rounds() {
  const { data } = await admin
    .from("ars_rounds")
    .select("id, name, submission_mode, opens_at, due_at, requires_review, config")
    .eq("course_id", courseId)
    .order("id", { ascending: true });
  return data ?? [];
}

// The Client's real Masters' Union process, in the shape the standard prompt
// asks a model to produce, wrapped in the prose and fences a model actually
// emits around it.
const mastersUnion = `Sure! Here's the process described in that document:

\`\`\`json
{
  "programme": "Masters' Union - ARS",
  "rounds": [
    {
      "name": "Application",
      "type": "form",
      "instructions": "Complete every section. You can save and come back.",
      "due": "2026-10-15",
      "mentorReviews": false,
      "pages": [
        {
          "title": "Personal details",
          "sections": [
            {
              "title": "About you",
              "questions": [
                { "label": "Full name", "type": "short_text", "prefill": "name" },
                { "label": "Gender", "type": "dropdown", "options": ["Female", "Male", "Prefer not to say"] }
              ]
            }
          ]
        },
        {
          "title": "Your essay",
          "sections": [
            { "questions": [{ "label": "Why this programme?", "type": "paragraph", "wordLimit": 200 }] }
          ]
        }
      ]
    },
    {
      "name": "Aptitude Test",
      "type": "test",
      "instructions": "A timed aptitude test.",
      "test": { "sections": ["QA", "LR", "DI"], "questionCount": 45, "durationMinutes": 120, "negativeMarking": false }
    },
    {
      "name": "Interview and Group Discussion",
      "type": "interview",
      "instructions": "A panel interview followed by a group discussion, on campus."
    }
  ]
}
\`\`\`

Let me know if you'd like me to adjust anything!`;

const replacement = JSON.stringify({
  rounds: [
    {
      name: "Replacement Round",
      type: "text",
      instructions: "Write five hundred words.",
      due: "2026-12-01",
    },
  ],
});

try {
  await createPerson("admin", "admin", COSPIRE_ORG);
  await createPerson("student", "student", COSPIRE_ORG);

  const { data: made } = await admin
    .from("courses")
    .insert({ org_id: COSPIRE_ORG, title: COURSE })
    .select("id")
    .single();
  courseId = made.id;

  const path = `/admin/courses/${courseId}/import`;

  // ------------------------------------------------------------- A. access
  const anon = await get(path, null);
  record(
    "an anonymous caller is sent to sign in",
    anon.status === 307 && (anon.location ?? "").includes("/login"),
    `${anon.status} -> ${anon.location}`,
  );

  const asStudent = await get(path, "student");
  record(
    "a student is refused the importer",
    asStudent.status === 307 && (asStudent.location ?? "").includes("/student"),
    `${asStudent.status} -> ${asStudent.location}`,
  );

  const page = await get(path, "admin");
  record("an admin opens the importer", page.status === 200, `${page.status}`);

  // ------------------------------------------------------------- B. prompt
  record(
    "the copyable prompt is on the page",
    page.body.includes("admission-process document") && page.body.includes("rounds"),
  );
  record(
    "the prompt lists the question types this platform actually renders",
    page.body.includes("month_year") && page.body.includes("score_list"),
    "generated from fieldTypes, so it cannot drift from the parser",
  );
  record(
    "the prompt forbids invented dates",
    page.body.includes("Do not estimate, infer or invent one"),
  );

  const pasteForm = formWith(page.body, "pasted");
  record("the paste form works without JavaScript", Boolean(pasteForm));
  if (!pasteForm) throw new Error("no paste form on the page");

  // ------------------------------------------------------------ C. reading
  const preview = await postForm(path, "admin", pasteForm, { pasted: mastersUnion });
  record("the action answered rather than erroring", preview.status === 200, `${preview.status}`);
  // Deliberately NOT asserting on "Application" or "Why this programme?": both
  // appear in the copyable prompt's own example, which is on the same page, so
  // either would pass against a page that had parsed nothing at all. That is
  // the false pass this harness found in its own first draft.
  record(
    "a model's answer wrapped in prose and fences is read",
    preview.body.includes("check, then create") &&
      preview.body.includes("Interview and Group Discussion") &&
      preview.body.includes("Masters&#x27; Union - ARS"),
    "the preview, its third round and the programme name the document gave",
  );
  record(
    "the preview says the aptitude round is not live yet",
    preview.body.includes("Not live yet") && preview.body.includes("test engine is not built"),
  );
  record(
    "the preview names the questions it would create, and how many",
    preview.body.includes("3 questions") && preview.body.includes("Your essay"),
    "counted from the parsed form, not from the prompt example",
  );

  // The whole point of a preview.
  record(
    "reading a paste writes nothing at all",
    (await rounds()).length === 0,
    `${(await rounds()).length} rounds in the database`,
  );

  // ------------------------------------------------------------ D. refusal
  const rubbish = await postForm(path, "admin", pasteForm, {
    pasted: "I could not read that document, sorry.",
  });
  record(
    "a paste with no JSON in it is refused in words an admin can act on",
    rubbish.body.includes("no JSON in what you pasted"),
  );
  record("and creates nothing", (await rounds()).length === 0);

  const truncated = await postForm(path, "admin", pasteForm, { pasted: '{"rounds": [' });
  record(
    "a half-copied answer is told it was cut off, not that it had no JSON",
    truncated.body.includes("cut off"),
  );

  // ------------------------------------------------------------ E. writing
  const createForm = formWith(preview.body, "courseId");
  record("the confirm form works without JavaScript", Boolean(createForm));
  if (!createForm) throw new Error("no confirm form in the preview");

  const created = await postForm(path, "admin", createForm, {
    courseId,
    pasted: mastersUnion,
  });
  record(
    "confirming redirects back to the programme",
    (created.location ?? "").includes(`/admin/courses/${courseId}`) &&
      (created.location ?? "").includes("imported"),
    `-> ${created.location}`,
  );

  let live = await rounds();
  record("three rounds were created", live.length === 3, `${live.length} rounds`);
  record(
    "in the order the document gave them",
    live.map((r) => r.name).join(" | ") ===
      "Application | Aptitude Test | Interview and Group Discussion",
    live.map((r) => r.name).join(" | "),
  );
  record(
    "with the modes this platform can deliver",
    live.map((r) => r.submission_mode).join(",") === "form,offline,offline",
    live.map((r) => r.submission_mode).join(","),
  );
  record(
    "a deadline is stored as the END of that day in IST",
    live[0].due_at === "2026-10-15T18:29:59+00:00",
    `${live[0].due_at}`,
  );
  record(
    "a round the document gave no date for stores nulls",
    live[2].opens_at === null && live[2].due_at === null,
  );
  record(
    "the application's two pages and three questions survived the round trip",
    live[0].config?.steps?.length === 2 &&
      live[0].config.steps.flatMap((s) => s.sections.flatMap((x) => x.fields)).length === 3,
  );
  record(
    "a model's 'dropdown' became a select carrying its options",
    live[0].config.steps[0].sections[0].fields[1].type === "select" &&
      live[0].config.steps[0].sections[0].fields[1].options.length === 3,
  );
  record(
    "the keys are ours, derived from the labels",
    live[0].config.steps[0].sections[0].fields[0].key === "full_name",
    live[0].config.steps[0].sections[0].fields[0].key,
  );
  record(
    "the aptitude round kept its specification for the test engine",
    live[1].config?.pendingFeature === "test-engine" && live[1].config.test?.questionCount === 45,
  );
  record(
    "mentor review is off for the application and on for the rest",
    live[0].requires_review === false &&
      live[1].requires_review === true &&
      live[2].requires_review === true,
  );

  // The round is now real. It must open in the builder the admin already knows.
  const builder = await get(`/admin/courses/${courseId}/rounds/${live[0].id}`, "admin");
  record(
    "an imported round opens in the hand-built round builder",
    builder.status === 200 && builder.body.includes("Why this programme?"),
    `${builder.status}`,
  );

  const programme = await get(`/admin/courses/${courseId}`, "admin");
  record(
    "the programme page lists the imported rounds",
    programme.body.includes("Application") && programme.body.includes("Aptitude Test"),
  );

  // ---------------------------------------------------------- F. replacing
  const replaced = await postForm(path, "admin", createForm, {
    courseId,
    pasted: replacement,
  });
  live = await rounds();
  record(
    "a second import REPLACES the process rather than adding to it",
    live.length === 1 && live[0].name === "Replacement Round",
    `${live.length} round(s): ${live.map((r) => r.name).join(", ")}`,
  );
  record("and lands back on the programme", (replaced.location ?? "").includes("imported"));

  // --------------------------------------- G. it will not destroy real work
  //
  // The check this whole feature is judged on. A student answers the round;
  // the next import must refuse entirely and leave the process untouched.
  await admin.from("content_access").insert({
    org_id: COSPIRE_ORG,
    student_id: people.student.id,
    resource_type: "course",
    resource_id: courseId,
    granted_by: people.admin.id,
  });

  const { error: submissionError } = await admin.from("ars_submissions").insert({
    org_id: COSPIRE_ORG,
    round_id: live[0].id,
    student_id: people.student.id,
    answer: { text: "My answer." },
  });

  if (submissionError) {
    record("a student's submission could be created for the destruction test", false, submissionError.message);
  } else {
    record("a student's submission exists on the round about to be replaced", true);

    const blocked = await postForm(path, "admin", createForm, {
      courseId,
      pasted: mastersUnion,
    });
    const after = await rounds();

    record(
      "an import that would destroy answered work is refused",
      blocked.body.includes("already answered"),
      "the admin is told why",
    );
    record(
      "and the existing process is left exactly as it was",
      after.length === 1 && after[0].name === "Replacement Round",
      `${after.length} round(s): ${after.map((r) => r.name).join(", ")}`,
    );
  }

  // ------------------------------------------------------- H. served CSS
  const cssHref = page.body.match(/href="([^"]*\.css[^"]*)"/)?.[1];
  if (cssHref) {
    const css = await fetch(`${BASE}${cssHref.replace(/&amp;/g, "&")}`).then((r) => r.text());
    const missing = ["panel", "pill", "muted", "form-error", "input", "button", "stack-form", "field"]
      .filter((name) => !css.includes(`.${name}`));
    record(
      "every class the importer uses exists in the SERVED stylesheet",
      missing.length === 0,
      missing.length === 0 ? "none undefined" : `undefined: ${missing.join(", ")}`,
    );
  } else {
    record("stylesheet found on the page", false, "no css link in HTML");
  }
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  // Cleanup, scoped to what this run created. Never "everything currently
  // here": that is the teardown near-miss of 2026-09-08.
  if (courseId) {
    const { data: mine } = await admin.from("ars_rounds").select("id").eq("course_id", courseId);
    for (const row of mine ?? []) {
      await admin.from("ars_submissions").delete().eq("round_id", row.id);
    }
    await admin.from("ars_process_runs").delete().eq("course_id", courseId);
    await admin.from("ars_rounds").delete().eq("course_id", courseId);
    await admin.from("content_access").delete().eq("resource_type", "course").eq("resource_id", courseId);
    await admin.from("courses").delete().eq("id", courseId);
  }
  for (const person of Object.values(people)) {
    await admin.auth.admin.deleteUser(person.id);
  }

  const counts = {};
  for (const table of ["courses", "ars_rounds", "profiles", "ars_submissions", "documents"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
