// The Phase 5a exit gate, driven end to end.
//
// The gate sentence, from CONTEXT.md:
//
//   a student submits each of the three round shapes, their assigned mentor
//   opens them in a queue and writes feedback, the student reads it, and a
//   second student -- and an unassigned mentor -- are refused both the row and
//   the uploaded file **at its Storage path**.
//
// Every piece of this has been verified in isolation: uploads 10/10, the
// importer 35/35, the report 17/17 and 12/12. None of it had ever been run as
// one sequence, so "ARS works" was an inference from parts rather than a
// demonstrated fact. This is the sequence.
//
// One word in that sentence has moved. "Writes feedback" was written when
// `ars_feedback` hung one row off one submission; the 2026-09-16 meeting
// replaced that with a report belonging to a whole process, so the mentor step
// here is the review transition that releases the student's view. The report's
// own path is covered by ars-report.sql and ars-report-ui.mjs.
//
// Method, as everywhere in this directory: throwaway accounts, real session
// cookies captured through @supabase/ssr, forms posted through the
// no-JavaScript path, and the database asked for ground truth rather than a
// success redirect believed.
//
// node --env-file=.env.local scripts/verify/ars-gate.mjs <baseUrl>

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
const PASSWORD = `GateVerify${stamp}x`;

const people = {};
let courseId = null;
const roundIds = {};
const objectPaths = [];

// --------------------------------------------------------------------- people

async function signIn(email) {
  const jar = [];
  const ssr = createServerClient(URL_, PUB, {
    cookies: { getAll: () => [], setAll: (list) => jar.push(...list) },
  });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);

  // A second client carrying the same access token, for the checks that must
  // ask the database directly as this person rather than through the app.
  const client = createClient(URL_, PUB, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });

  return { client, cookie: jar.map((c) => `${c.name}=${c.value}`).join("; ") };
}

async function createPerson(key, role, org = COSPIRE_ORG) {
  const email = `gate-${key.toLowerCase()}-${stamp}@example.com`;
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
    name: `Gate ${key}`,
    email,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(`profile ${email}: ${profileError.message}`);
  }

  people[key] = { id: data.user.id, ...(await signIn(email)) };
}

// ----------------------------------------------------------------------- http

async function get(path, who) {
  const res = await fetch(`${BASE}${path}`, {
    headers: who ? { cookie: people[who].cookie } : {},
    redirect: "manual",
  });
  return { body: await res.text(), location: res.headers.get("location"), status: res.status };
}

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

// Posts a form the way a browser with scripting off would: whatever hidden
// fields the server rendered, then the values a person typed. `origin` is
// required -- Next refuses a Server Action without it and answers 500.
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

// ------------------------------------------------------------------ the rounds

const formSteps = [
  {
    key: "about_you",
    title: "About you",
    sections: [
      {
        title: "Your details",
        fields: [
          { key: "city", label: "City of residence", required: true, type: "short_text" },
          {
            key: "stream",
            label: "Which stream?",
            options: ["Commerce", "Science", "Humanities"],
            required: true,
            type: "select",
          },
        ],
      },
    ],
  },
  {
    key: "your_essay",
    title: "Your essay",
    sections: [
      {
        fields: [
          { key: "essay", label: "Why this programme?", required: true, type: "long_text", wordLimit: 250 },
        ],
      },
    ],
  },
];

async function submissionFor(roundKey) {
  const { data } = await admin
    .from("ars_submissions")
    .select("id, status, answer, student_id, submitted_at, reviewed_at, reviewed_by")
    .eq("round_id", roundIds[roundKey]);
  return (data ?? [])[0] ?? null;
}

try {
  // ------------------------------------------------------------- A. the cast
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("othermentor", "mentor");
  await createPerson("studenta", "student");
  await createPerson("studentb", "student");

  // Only student A is this mentor's. That is the whole point of the pair.
  await admin.from("mentor_assignments").insert({
    assigned_by: people.admin.id,
    mentor_id: people.mentor.id,
    org_id: COSPIRE_ORG,
    student_id: people.studenta.id,
  });

  const { data: made, error: courseError } = await admin
    .from("courses")
    .insert({ org_id: COSPIRE_ORG, title: `Gate Programme ${stamp}` })
    .select("id")
    .single();
  if (courseError) throw new Error(`course: ${courseError.message}`);
  courseId = made.id;

  // BOTH students hold the programme. A second student who simply lacked the
  // grant would prove far less: this way the only thing standing between
  // student B and student A's answers is the submission policy itself.
  for (const who of ["studenta", "studentb"]) {
    const { error } = await admin.from("content_access").insert({
      granted_by: people.admin.id,
      org_id: COSPIRE_ORG,
      resource_id: courseId,
      resource_type: "course",
      student_id: people[who].id,
    });
    if (error) throw new Error(`grant ${who}: ${error.message}`);
  }

  const { data: rounds, error: roundsError } = await admin
    .from("ars_rounds")
    .insert([
      {
        config: { prompt: "Write about a decision you would now make differently." },
        course_id: courseId,
        name: "Written answer",
        org_id: COSPIRE_ORG,
        requires_review: true,
        sort_order: 1,
        submission_mode: "text",
      },
      {
        config: { prompt: "Upload your resume as a PDF." },
        course_id: courseId,
        name: "Video essay",
        org_id: COSPIRE_ORG,
        requires_review: true,
        sort_order: 2,
        submission_mode: "file",
      },
      {
        config: { prompt: "Complete both pages.", steps: formSteps },
        course_id: courseId,
        name: "Application form",
        org_id: COSPIRE_ORG,
        requires_review: true,
        sort_order: 3,
        submission_mode: "form",
      },
      {
        config: { prompt: "A panel interview, held on campus." },
        course_id: courseId,
        name: "Interview",
        org_id: COSPIRE_ORG,
        requires_review: true,
        sort_order: 4,
        submission_mode: "offline",
      },
    ])
    .select("id, name, submission_mode");
  if (roundsError) throw new Error(`rounds: ${roundsError.message}`);

  for (const row of rounds) {
    if (row.name === "Written answer") roundIds.text = row.id;
    if (row.name === "Video essay") roundIds.file = row.id;
    if (row.name === "Application form") roundIds.form = row.id;
    if (row.name === "Interview") roundIds.offline = row.id;
  }

  record("the process exists with all four round shapes", Object.keys(roundIds).length === 4);

  // ------------------------------------------- B. the student sees the process
  const process = await get("/student/ars", "studenta");
  record(
    "the student's process list shows the rounds",
    process.status === 200 &&
      process.body.includes("Written answer") &&
      process.body.includes("Application form"),
    `${process.status}`,
  );

  // ------------------------------------------------ C. shape one: a written answer
  const textPage = await get(`/student/ars/${roundIds.text}`, "studenta");
  const textForm = formWith(textPage.body, "roundId");
  record("the written round renders a form that works without JavaScript", Boolean(textForm));
  if (!textForm) throw new Error("no form on the text round");

  await postForm(`/student/ars/${roundIds.text}`, "studenta", textForm, {
    response: "I once chose the safer option and have regretted it since.",
    roundId: roundIds.text,
    stepIndex: 0,
  });

  let textSubmission = await submissionFor("text");
  record(
    "the written answer is handed in, stamped by the server",
    textSubmission?.status === "submitted" && Boolean(textSubmission.submitted_at),
    `status=${textSubmission?.status}`,
  );
  record(
    "and it holds what the student actually typed",
    JSON.stringify(textSubmission?.answer ?? {}).includes("regretted it since"),
  );

  // ------------------------------------------------------- D. shape two: a file
  //
  // The upload itself goes through the student's own Supabase client, which is
  // exactly what the browser does: the bytes never pass through the app server,
  // per operating manual §8. `recordArsUploadAction` is a JavaScript-only
  // action and its own rules are covered by ars-upload.mjs; attaching here uses
  // the student's own PostgREST client, so RLS still decides.
  const objectPath = `org/${COSPIRE_ORG}/ars/${people.studenta.id}/${crypto.randomUUID()}.pdf`;
  const bytes = new TextEncoder().encode("%PDF-1.4 gate resume\n%%EOF\n");
  const uploaded = await people.studenta.client.storage
    .from("ars-uploads")
    .upload(objectPath, bytes, { contentType: "application/pdf" });
  record("the student uploads into their own private folder", !uploaded.error, uploaded.error?.message);
  if (!uploaded.error) objectPaths.push(objectPath);

  // The draft is created by the upload action in the real flow, not by the
  // form: `saveAnswers` skips file fields entirely, so posting the form first
  // would be refused for a missing required answer. The insert goes through the
  // student's own client, exactly as the action does, so RLS and the sequence
  // trigger still decide whether it is allowed.
  const drafted = await people.studenta.client
    .from("ars_submissions")
    .insert({
      answer: {
        upload: {
          mimeType: "application/pdf",
          originalName: "resume.pdf",
          size: bytes.byteLength,
          storagePath: objectPath,
        },
      },
      org_id: COSPIRE_ORG,
      round_id: roundIds.file,
      status: "draft",
      student_id: people.studenta.id,
    })
    .select("id");
  record(
    "the student attaches their own upload to a draft of their own",
    !drafted.error && drafted.data?.length === 1,
    drafted.error?.message,
  );

  const filePage = await get(`/student/ars/${roundIds.file}`, "studenta");
  const fileForm = formWith(filePage.body, "roundId");
  record("the file round renders a form once a draft exists", Boolean(fileForm));
  if (!fileForm) throw new Error("no form on the file round");

  await postForm(`/student/ars/${roundIds.file}`, "studenta", fileForm, {
    roundId: roundIds.file,
    stepIndex: 0,
  });

  const fileSubmission = await submissionFor("file");
  record(
    "the file round is handed in with the upload on it",
    fileSubmission?.status === "submitted" &&
      JSON.stringify(fileSubmission.answer).includes(objectPath),
    `status=${fileSubmission?.status}`,
  );

  // --------------------------------------------- E. shape three: a two-page form
  const formPage = await get(`/student/ars/${roundIds.form}`, "studenta");
  const step1 = formWith(formPage.body, "roundId");
  record("the multi-step form renders its first page", Boolean(step1));
  if (!step1) throw new Error("no form on the form round");

  await postForm(`/student/ars/${roundIds.form}`, "studenta", step1, {
    city: "Pune",
    roundId: roundIds.form,
    stepIndex: 0,
    stream: "Commerce",
  });

  const midway = await submissionFor("form");
  record(
    "the first page saves as a draft rather than handing in",
    midway?.status === "draft" && JSON.stringify(midway.answer).includes("Pune"),
    `status=${midway?.status}`,
  );

  const page2 = await get(`/student/ars/${roundIds.form}?step=2`, "studenta");
  const step2 = formWith(page2.body, "roundId");
  record("the second page is reachable and remembers the first", Boolean(step2));
  if (!step2) throw new Error("no second page");

  await postForm(`/student/ars/${roundIds.form}?step=2`, "studenta", step2, {
    essay: "Because the people here argue with each other in public and change their minds.",
    roundId: roundIds.form,
    stepIndex: 1,
  });

  const formSubmission = await submissionFor("form");
  record(
    "the last page hands the whole form in, keeping both pages' answers",
    formSubmission?.status === "submitted" &&
      JSON.stringify(formSubmission.answer).includes("Pune") &&
      JSON.stringify(formSubmission.answer).includes("change their minds"),
    `status=${formSubmission?.status}`,
  );

  // ------------------------------------------------- F. the mentor's queue
  const queue = await get("/mentor", "mentor");
  record(
    "the assigned mentor's queue shows all three handed-in rounds",
    queue.status === 200 &&
      queue.body.includes("Written answer") &&
      queue.body.includes("Video essay") &&
      queue.body.includes("Application form"),
    `${queue.status}`,
  );

  const otherQueue = await get("/mentor", "othermentor");
  record(
    "an unassigned mentor's queue is empty of them",
    otherQueue.status === 200 &&
      !otherQueue.body.includes("Written answer") &&
      !otherQueue.body.includes("Application form"),
    "sees none of this student's work",
  );

  textSubmission = await submissionFor("text");
  const detail = await get(`/mentor/ars/${textSubmission.id}`, "mentor");
  record(
    "the mentor opens the submission and reads the answer",
    detail.status === 200 && detail.body.includes("regretted it since"),
    `${detail.status}`,
  );

  const otherDetail = await get(`/mentor/ars/${textSubmission.id}`, "othermentor");
  record(
    "an unassigned mentor opening the same submission is refused",
    otherDetail.status === 404 || otherDetail.status === 307,
    `${otherDetail.status}`,
  );

  // ------------------------------------------------- G. the review transition
  const reviewForm = formWith(detail.body, "submissionId");
  record("the review control works without JavaScript", Boolean(reviewForm));
  if (reviewForm) {
    await postForm(`/mentor/ars/${textSubmission.id}`, "mentor", reviewForm, {
      submissionId: textSubmission.id,
    });
    const reviewed = await submissionFor("text");
    record(
      "the mentor marks it reviewed, and the server stamps who and when",
      reviewed?.status === "reviewed" &&
        Boolean(reviewed.reviewed_at) &&
        reviewed.reviewed_by === people.mentor.id,
      `status=${reviewed?.status}`,
    );
  }

  const studentAfter = await get(`/student/ars/${roundIds.text}`, "studenta");
  record(
    "the student sees that it has been reviewed",
    studentAfter.status === 200 && /reviewed/i.test(studentAfter.body),
    `${studentAfter.status}`,
  );

  // ------------------------------------- H. the second student, and the stranger
  //
  // Counting rows rather than trusting the absence of an error: RLS filtering a
  // read to nothing returns success with no rows, which this project has been
  // caught by twice.
  const bRows = await people.studentb.client
    .from("ars_submissions")
    .select("id")
    .eq("student_id", people.studenta.id);
  record(
    "a second student holding the same programme sees none of the first student's submissions",
    !bRows.error && (bRows.data ?? []).length === 0,
    `${(bRows.data ?? []).length} rows`,
  );

  const mentorRows = await people.othermentor.client
    .from("ars_submissions")
    .select("id")
    .eq("student_id", people.studenta.id);
  record(
    "an unassigned mentor sees none of them either",
    !mentorRows.error && (mentorRows.data ?? []).length === 0,
    `${(mentorRows.data ?? []).length} rows`,
  );

  const bFile = await people.studentb.client.storage.from("ars-uploads").download(objectPath);
  record(
    "the second student is refused the uploaded file AT ITS STORAGE PATH",
    Boolean(bFile.error),
    bFile.error ? "refused" : "READ THE FILE",
  );

  const strangerFile = await people.othermentor.client.storage
    .from("ars-uploads")
    .download(objectPath);
  record(
    "the unassigned mentor is refused it at the same path",
    Boolean(strangerFile.error),
    strangerFile.error ? "refused" : "READ THE FILE",
  );

  const ownFile = await people.studenta.client.storage.from("ars-uploads").download(objectPath);
  record("the owning student can still read their own file", !ownFile.error, ownFile.error?.message);

  const assignedFile = await people.mentor.client.storage.from("ars-uploads").download(objectPath);
  record(
    "the assigned mentor can read it now it has been handed in",
    !assignedFile.error,
    assignedFile.error?.message,
  );

  // ------------------------------------------- I. the off-platform round
  const offlineQueue = await get("/mentor", "mentor");
  const offlineForm = formWith(offlineQueue.body, "outcome");
  if (offlineForm) {
    await postForm("/mentor", "mentor", offlineForm, {
      note: "Held on campus. Confident, thought before answering.",
      outcome: "completed",
      roundId: roundIds.offline,
      studentId: people.studenta.id,
    });
    const offline = await submissionFor("offline");
    record(
      "the mentor records the off-platform round's outcome",
      offline?.status === "submitted" && JSON.stringify(offline.answer).includes("completed"),
      `status=${offline?.status}`,
    );
  } else {
    record("the mentor can record an off-platform outcome", false, "no form found on /mentor");
  }

  // --------------------------------------------------------- J. the run closes
  const { data: runs } = await admin
    .from("ars_process_runs")
    .select("id, completed_at")
    .eq("course_id", courseId);
  record(
    "the process run is stamped complete once every round is in",
    (runs ?? []).length === 1 && Boolean(runs[0].completed_at),
    `completed_at=${runs?.[0]?.completed_at ?? "null"}`,
  );
} catch (error) {
  record("run completed without throwing", false, String(error));
} finally {
  // Scoped to what this run created. Never "everything currently here": that is
  // the teardown near-miss of 2026-09-08.
  if (objectPaths.length) await admin.storage.from("ars-uploads").remove(objectPaths);
  if (courseId) {
    const { data: mine } = await admin.from("ars_rounds").select("id").eq("course_id", courseId);
    for (const row of mine ?? []) await admin.from("ars_submissions").delete().eq("round_id", row.id);
    await admin.from("ars_process_runs").delete().eq("course_id", courseId);
    await admin.from("ars_rounds").delete().eq("course_id", courseId);
    await admin
      .from("content_access")
      .delete()
      .eq("resource_type", "course")
      .eq("resource_id", courseId);
    await admin.from("courses").delete().eq("id", courseId);
  }
  // Assignments first, and ALL of them, before any account is removed.
  // `mentor_assignments.assigned_by` is ON DELETE RESTRICT, so deleting the
  // admin while its own assignment still exists fails -- silently, because the
  // Auth API reports it in a return value nobody was reading. That leaked one
  // profile per run until it was noticed in the live counts.
  for (const person of Object.values(people)) {
    await admin.from("mentor_assignments").delete().eq("student_id", person.id);
    await admin.from("mentor_assignments").delete().eq("mentor_id", person.id);
    await admin.from("mentor_assignments").delete().eq("assigned_by", person.id);
  }
  for (const person of Object.values(people)) {
    const { error } = await admin.auth.admin.deleteUser(person.id);
    if (error) console.log(`  cleanup could not remove ${person.id}: ${error.message}`);
  }

  const counts = {};
  for (const table of ["courses", "ars_rounds", "ars_submissions", "ars_process_runs", "profiles", "documents"]) {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    counts[table] = count;
  }
  console.log("\nlive counts after cleanup:", JSON.stringify(counts));

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed} of ${results.length} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
