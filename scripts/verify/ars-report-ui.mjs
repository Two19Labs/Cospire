// Drives the no-JavaScript ARS report workflow against a running production
// build and the hosted database. Every row and Auth user is scoped to this run
// and removed in finally.
//
// node --env-file=.env.local scripts/verify/ars-report-ui.mjs http://127.0.0.1:3100

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const adminClient = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `ReportVerify${stamp}x`;
const title = `Report verify ${stamp}`;
const people = {};
const made = { course: null, run: null, template: null, report: null };
const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

function renderedText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/\s+/g, " ");
}

async function createPerson(key, role) {
  const email = `report-verify-${key}-${stamp}@example.com`;
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const { error: profileError } = await adminClient.from("profiles").insert({
    email, id: data.user.id, name: `Report Verify ${key}`, org_id: 1, role,
  });
  if (profileError) throw profileError;

  const jar = [];
  const client = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (list) => jar.push(...list) } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  people[key] = { id: data.user.id, cookie: jar.map((c) => `${c.name}=${c.value}`).join("; ") };
}

async function get(path, who) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie: people[who].cookie }, redirect: "manual" });
  return { body: await response.text(), status: response.status };
}

function actionFor(html, field) {
  for (const match of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    if (!match[0].includes(`name="${field}"`)) continue;
    const id = match[0].match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
    if (id) return id;
  }
  return null;
}

async function post(path, who, actionId, fields) {
  const body = new FormData();
  body.set(`$ACTION_ID_${actionId}`, "");
  for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
  const response = await fetch(`${BASE}${path}`, {
    body, headers: { cookie: people[who].cookie }, method: "POST", redirect: "manual",
  });
  return { location: response.headers.get("location"), status: response.status };
}

try {
  await createPerson("admin", "admin");
  await createPerson("mentor", "mentor");
  await createPerson("student", "student");

  const { error: assignError } = await adminClient.from("mentor_assignments").insert({
    assigned_by: people.admin.id, mentor_id: people.mentor.id, org_id: 1, student_id: people.student.id,
  });
  if (assignError) throw assignError;

  const { data: course, error: courseError } = await adminClient.from("courses").insert({ org_id: 1, title }).select("id").single();
  if (courseError) throw courseError;
  made.course = course.id;

  const { error: grantError } = await adminClient.from("content_access").insert({
    granted_by: people.admin.id, org_id: 1, resource_id: course.id,
    resource_type: "course", student_id: people.student.id,
  });
  if (grantError) throw grantError;

  const { data: round, error: roundError } = await adminClient.from("ars_rounds").insert({
    config: { prompt: "Verification" }, course_id: course.id, name: "Verification round", org_id: 1,
    submission_mode: "text",
  }).select("id").single();
  if (roundError) throw roundError;

  const { data: run, error: runError } = await adminClient.from("ars_process_runs").insert({
    completed_at: new Date().toISOString(), course_id: course.id, org_id: 1,
    round_order: [round.id], student_id: people.student.id,
  }).select("id").single();
  if (runError) throw runError;
  made.run = run.id;

  const { data: template, error: templateError } = await adminClient.from("ars_report_templates").insert({
    course_id: course.id, name: "Verification report", org_id: 1,
    overall_levels: ["Moderate", "Strong"], readiness_tags: ["Developing", "Ready"],
  }).select("id").single();
  if (templateError) throw templateError;
  made.template = template.id;

  const { data: components, error: componentsError } = await adminClient.from("ars_report_template_components").insert([
    { metric_names: ["Clarity"], org_id: 1, template_id: template.id, title: "Interview", weightage_pct: 60, sort_order: 1 },
    { metric_names: ["Depth"], org_id: 1, template_id: template.id, title: "Profile", weightage_pct: 40, sort_order: 2 },
  ]).select("id, title");
  if (componentsError) throw componentsError;

  const queue = await get("/mentor", "mentor");
  record("mentor queue renders the completed process", queue.status === 200 && renderedText(queue.body).includes(title), `${queue.status}`);
  const createId = actionFor(queue.body, "runId");
  record("start-report form renders without JavaScript", Boolean(createId));
  if (!createId) throw new Error("missing create action");

  const created = await post("/mentor", "mentor", createId, { runId: run.id, templateId: template.id });
  const reportPath = created.location;
  const reportMatch = reportPath?.match(/^\/mentor\/reports\/(\d+)$/);
  record("mentor starts a report", created.status === 303 && Boolean(reportMatch), `${created.status} -> ${reportPath}`);
  if (!reportMatch) throw new Error("report was not created");
  made.report = Number(reportMatch[1]);

  for (const component of components) {
    const editor = await get(reportPath, "mentor");
    const saveId = actionFor(editor.body, "templateComponentId");
    record(`${component.title} editor renders`, editor.status === 200 && Boolean(saveId));
    if (!saveId) throw new Error("missing save action");
    const saved = await post(reportPath, "mentor", saveId, {
      actionPlan: `Plan ${component.title}`, developmentAreas: `Develop ${component.title}`,
      metricNote_0: `Observation ${component.title}`, metricScore_0: component.title === "Interview" ? 9 : 7,
      nextStep: `Next ${component.title}`, readinessTag: component.title === "Interview" ? "Ready" : "Developing",
      reportId: made.report, score: component.title === "Interview" ? 8 : 6,
      strengths: `Strength ${component.title}`, templateComponentId: component.id, timeline: "30 days",
    });
    record(`${component.title} saves through its Server Action`, saved.status === 303 && saved.location?.includes("notice=saved"), `${saved.status}`);
  }

  const ready = await get(reportPath, "mentor");
  record("weighted total is rendered after both saves", renderedText(ready.body).includes("72/100"));
  const releaseId = actionFor(ready.body, "closingNote");
  record("release form renders without JavaScript", Boolean(releaseId));
  if (!releaseId) throw new Error("missing release action");
  const released = await post(reportPath, "mentor", releaseId, {
    closingNote: "Keep building on this progress.", overallLevel: "Moderate", reportId: made.report,
  });
  record("mentor releases the report", released.status === 303 && released.location?.includes("notice=released"), `${released.status}`);

  const studentHome = await get("/student", "student");
  record("released report appears on the student home", studentHome.status === 200 && renderedText(studentHome.body).includes(title));
  const studentReport = await get(`/student/reports/${made.report}`, "student");
  const studentText = renderedText(studentReport.body);
  record("student reads scores, metric observations, and mentor note", studentReport.status === 200 && studentText.includes("72/100") && studentText.includes("Observation Interview") && studentText.includes("Keep building on this progress."), `${studentReport.status}`);
} finally {
  if (made.report) await adminClient.from("ars_reports").delete().eq("id", made.report);
  if (made.run) await adminClient.from("ars_process_runs").delete().eq("id", made.run);
  if (made.template) await adminClient.from("ars_report_templates").delete().eq("id", made.template);
  if (made.course) await adminClient.from("courses").delete().eq("id", made.course);
  if (people.student) await adminClient.from("mentor_assignments").delete().eq("student_id", people.student.id);
  for (const person of Object.values(people)) await adminClient.auth.admin.deleteUser(person.id);

  const failed = results.filter((result) => !result.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}
