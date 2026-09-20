// Render signed-in screens to PNG, so a look can be judged rather than asserted.
//
// There is no browser automation in this project and this does not add any: it
// signs in over HTTP the way `scripts/verify/` already does, saves the served
// HTML with a <base> tag pointing back at the running app, and hands the file
// to the Chrome that is already installed. Stylesheets, fonts and images then
// load from the app itself, so what is captured is what the app served.
//
// It creates a throwaway admin, student, programme and rounds, and deletes them
// in a finally block scoped to what it created.
//
// node --env-file=.env.local scripts/verify/shot.mjs <baseUrl> <outDir>

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const run = promisify(execFile);

const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
const OUT = process.argv[3] ?? "coverage/shots";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => existsSync(candidate));

const admin = createClient(URL_, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const COSPIRE_ORG = 1;
const stamp = Date.now();
const PASSWORD = `ShotVerify${stamp}x`;
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

async function createPerson(key, role) {
  const email = `shot-${key}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`create ${email}: ${error.message}`);
  const { error: pe } = await admin.from("profiles").insert({
    id: data.user.id,
    org_id: COSPIRE_ORG,
    role,
    name: key === "student" ? "Aditya Singhani" : "Cospire Admin",
    email,
  });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  people[key] = { id: data.user.id, cookie: await signIn(email) };
}

const profileDir = resolve(OUT, `.chrome-${stamp}`);

async function shoot(name, path, who, width = 1440, height = 1100) {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie: people[who].cookie } });
  let html = await res.text();
  // <base> makes every relative asset resolve against the running app, so the
  // capture uses the real stylesheet and the real self-hosted font.
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${BASE}/">`);

  // Every <script> comes out. React cannot hydrate from a file:// origin -- the
  // RSC payload fetches against the wrong origin and the client error boundary
  // replaces the page -- and `--disable-javascript` is a no-op in Chrome's new
  // headless. Removing the scripts leaves the server HTML and the real
  // stylesheet, which is what this is meant to photograph: every screen here is
  // built to work with scripting off, so it is a state a visitor can really be
  // in rather than a contrivance.
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "");

  const file = resolve(OUT, `${name}.html`);
  writeFileSync(file, html, "utf8");

  // Chrome writes the screenshot itself and resolves this path against its own
  // working directory, not ours, so it must be absolute.
  const png = resolve(OUT, `${name}.png`);
  const { stdout, stderr } = await run(CHROME, [
    "--headless",
    "--no-sandbox",
    // A throwaway profile per run. Chrome caches file:// pages within a
    // profile, and without this it re-photographs the previous run's HTML --
    // which looks exactly like a change that did not take effect, and cost an
    // hour of looking in the wrong place.
    `--user-data-dir=${profileDir}`,
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    `--screenshot=${png}`,
    "--virtual-time-budget=4000",
    `file:///${file.replace(/\\/g, "/")}`,
  ]);
  const wrote = existsSync(png);
  console.log(wrote ? "shot" : "NO IMAGE", png, `(HTTP ${res.status})`);
  if (!wrote) console.log("  chrome:", (stdout + stderr).trim().slice(0, 400) || "(silent)");
}

try {
  if (!CHROME) throw new Error("no Chrome or Edge found");
  mkdirSync(OUT, { recursive: true });

  await createPerson("admin", "admin");
  await createPerson("student", "student");

  const { data: made } = await admin
    .from("courses")
    // An ARS process, not a programme: these captures are of the ARS section,
    // and a row of the wrong kind would not appear in its list at all.
    .insert({ kind: "ars_process", org_id: COSPIRE_ORG, title: "Northgate School of Management - ARS" })
    .select("id")
    .single();
  courseId = made.id;

  await admin.from("content_access").insert({
    org_id: COSPIRE_ORG,
    student_id: people.student.id,
    resource_type: "course",
    resource_id: courseId,
    granted_by: people.admin.id,
  });

  // The application round, built the way the importer builds one.
  const steps = [
    {
      key: "personal_details",
      title: "Personal Details",
      subtitle: "Most of this we already hold. Correct anything out of date.",
      sections: [
        {
          title: "About you",
          fields: [
            { key: "full_name", label: "Full name, as it appears on your identity document", type: "short_text", required: true, prefill: "name" },
            { key: "email", label: "Email address", type: "short_text", required: true, prefill: "email" },
            { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
            { key: "gender", label: "Gender", type: "select", required: true, options: ["Female", "Male", "Non-binary", "Prefer not to say"] },
            { key: "city", label: "City of residence", type: "short_text", required: true },
            { key: "category", label: "Category, if you wish to declare one", type: "select", options: ["General", "OBC", "SC", "ST", "EWS"] },
          ],
        },
        {
          title: "Your interests",
          fields: [
            { key: "interest", label: "Which of these interests you most?", type: "radio", required: true, options: ["Finance", "Marketing", "Operations", "Technology and Product", "Entrepreneurship"] },
            { key: "why", label: "Why this programme?", type: "long_text", required: true, wordLimit: 250, placeholder: "Take your time. The panel reads a great many of these." },
            { key: "resume", label: "Upload your resume", type: "file", required: true, accept: ["pdf"] },
          ],
        },
      ],
    },
    { key: "academics", title: "Academic Record", sections: [{ fields: [{ key: "board", label: "Class 12 board", type: "short_text", required: true }] }] },
    { key: "experience", title: "Experience", sections: [{ fields: [{ key: "months", label: "Months of work experience", type: "number", required: true }] }] },
    { key: "essay", title: "The Essay", sections: [{ fields: [{ key: "essay", label: "Describe a decision you would now make differently", type: "long_text", required: true, wordLimit: 250 }] }] },
  ];

  const { data: rows, error: re } = await admin
    .from("ars_rounds")
    .insert([
      {
        org_id: COSPIRE_ORG,
        course_id: courseId,
        name: "Written Application",
        submission_mode: "form",
        requires_review: false,
        opens_at: "2026-10-01T00:00:00+05:30",
        due_at: "2026-10-20T23:59:59+05:30",
        config: { prompt: "Complete all four parts. You can save and come back.", steps },
      },
      {
        org_id: COSPIRE_ORG,
        course_id: courseId,
        name: "Northgate Aptitude Test",
        submission_mode: "offline",
        requires_review: true,
        config: { prompt: "A timed aptitude test. 45 questions, two hours, no negative marking.", pendingFeature: "test-engine" },
      },
      {
        org_id: COSPIRE_ORG,
        course_id: courseId,
        name: "Interview and Group Discussion",
        submission_mode: "offline",
        requires_review: true,
        config: { prompt: "A panel interview followed by a group discussion." },
      },
    ])
    .select("id, name");
  if (re) throw new Error(`rounds: ${re.message}`);

  const application = rows.find((r) => r.name === "Written Application");

  await shoot("student-round", `/student/ars/${application.id}`, "student");
  await shoot("student-process", "/student/ars", "student");
  await shoot("admin-programmes", "/admin/courses", "admin", 1440, 1250);
  await shoot("admin-ars", "/admin/ars", "admin", 1440, 1250);
  await shoot("admin-process", `/admin/ars/${courseId}`, "admin", 1440, 1300);
  await shoot("admin-import", `/admin/ars/${courseId}/import`, "admin", 1440, 1300);
  await shoot("student-round-phone", `/student/ars/${application.id}`, "student", 520, 1000);
} catch (error) {
  console.error("FAILED:", error.message);
  process.exitCode = 1;
} finally {
  if (courseId) {
    await admin.from("ars_rounds").delete().eq("course_id", courseId);
    await admin
      .from("content_access")
      .delete()
      .eq("resource_type", "course")
      .eq("resource_id", courseId);
    await admin.from("courses").delete().eq("id", courseId);
  }
  for (const person of Object.values(people)) {
    await admin.auth.admin.deleteUser(person.id);
  }
  const counts = {};
  for (const t of ["courses", "ars_rounds", "profiles", "documents"]) {
    const { count } = await admin.from(t).select("*", { count: "exact", head: true });
    counts[t] = count;
  }
  console.log("live counts after cleanup:", JSON.stringify(counts));
}
