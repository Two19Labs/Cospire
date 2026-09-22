// Drives report-template round links over HTTP against a running build and the
// hosted database, reproducing the 2026-09-21 demo: a template as the importer
// leaves it (no programme, no links) is moved into a process, then linked.
// Every row and Auth user is scoped to this run and removed in finally.
//
// node --env-file=.env.local scripts/verify/report-round-links.mjs http://127.0.0.1:3100

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const db = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `LinkVerify${stamp}x`;
const made = { courses: [], template: null, user: null };
const results = [];
let cookie = "";

function record(name, pass, detail = "") {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function counts() {
  const out = {};
  for (const table of ["profiles", "courses", "ars_rounds", "ars_report_templates", "ars_report_template_components"]) {
    const { count } = await db.from(table).select("*", { count: "exact", head: true });
    out[table] = count;
  }
  return out;
}

const get = async (path) => (await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" })).text();
const forms = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((match) => match[0]);
const componentForm = (html, componentId) =>
  forms(html).find((form) => form.includes('name="componentId"') && form.includes(`value="${componentId}"`));
const options = (form) =>
  [...(form ?? "").matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]*)<\/option>/g)].map((match) => ({
    id: Number(match[1]),
    label: match[2].replace(/&amp;/g, "&").replace(/&#x27;/g, "'"),
  }));

function fieldValue(form, name) {
  const area = form.match(new RegExp(`<textarea[^>]*name="${name}"[^>]*>([\\s\\S]*?)</textarea>`));
  if (area) return area[1].replace(/&amp;/g, "&");
  return form.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1]
    ?? form.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`))?.[1] ?? "";
}

async function post(path, form, fields) {
  const id = form.match(/\$ACTION_ID_([a-f0-9]+)/)?.[1];
  const body = new FormData();
  body.set(`$ACTION_ID_${id}`, "");
  for (const [key, value] of Object.entries(fields)) body.set(key, String(value));
  const response = await fetch(`${BASE}${path}`, { body, headers: { cookie }, method: "POST", redirect: "manual" });
  return { location: response.headers.get("location") ?? "", status: response.status };
}

async function makeProcess(title, roundNames) {
  const { data: course } = await db.from("courses")
    .insert({ kind: "ars_process", org_id: 1, title }).select("id").single().throwOnError();
  made.courses.push(course.id);
  const { data: rounds } = await db.from("ars_rounds").insert(roundNames.map((name, index) => ({
    config: { prompt: "Verification" }, course_id: course.id, name, org_id: 1, sort_order: index, submission_mode: "text",
  }))).select("id, name").throwOnError();
  return { id: course.id, rounds, title };
}

const baseline = await counts();
try {
  const email = `link-verify-${stamp}@example.com`;
  const { data: user, error } = await db.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  made.user = user.user.id;
  await db.from("profiles").insert({ email, id: made.user, name: "Link Verify", org_id: 1, role: "admin" }).throwOnError();
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (list) => jar.push(...list) } });
  const { error: signInError } = await ssr.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  cookie = jar.map((entry) => `${entry.name}=${entry.value}`).join("; ");

  const target = await makeProcess(`Link verify target ${stamp}`, ["Written application", "Personal interview"]);
  const other = await makeProcess(`Link verify other ${stamp}`, ["Written application"]);

  const { data: template } = await db.from("ars_report_templates").insert({
    course_id: null, is_active: false, name: `Link verify template ${stamp}`, org_id: 1,
    overall_levels: ["Moderate", "Strong"], readiness_tags: ["Developing", "Ready"],
  }).select("id").single().throwOnError();
  made.template = template.id;
  const { data: components } = await db.from("ars_report_template_components").insert([
    { metric_names: ["Clarity"], org_id: 1, sort_order: 1, template_id: template.id, title: "Profile and content", weightage_pct: 60 },
    { metric_names: ["Depth"], org_id: 1, sort_order: 2, template_id: template.id, title: "Interview", weightage_pct: 40 },
  ]).select("id, title").throwOnError();
  const path = `/admin/report-templates/${template.id}`;

  // No programme yet: every round is offered, each carrying its process name.
  let html = await get(path);
  const unscoped = options(componentForm(html, components[0].id));
  const otherOption = unscoped.find((option) => option.id === other.rounds[0].id);
  record("no programme: rounds are labelled with their process",
    otherOption?.label === `${other.title} · Written application`, otherOption?.label ?? "missing");

  const settings = forms(html).find((form) => form.includes('name="readinessTags"'));
  const saved = await post(path, settings, {
    courseId: target.id, isActive: "on", name: fieldValue(settings, "name"),
    overallLevels: fieldValue(settings, "overallLevels"), readinessTags: fieldValue(settings, "readinessTags"), templateId: template.id,
  });
  const { data: afterSave } = await db.from("ars_report_templates").select("course_id, is_active").eq("id", template.id).single();
  record("programme set and template activated",
    saved.location.includes("otice=saved") && afterSave.course_id === target.id && afterSave.is_active, JSON.stringify(afterSave));

  // Programme set: exactly that process's rounds, in process order.
  html = await get(path);
  const scoped = options(componentForm(html, components[0].id));
  record("programme set: only its rounds are offered, in order",
    JSON.stringify(scoped.map((option) => option.id)) === JSON.stringify(target.rounds.map((round) => round.id)),
    scoped.map((option) => option.label).join(" | "));

  for (const [index, component] of components.entries()) {
    const form = componentForm(await get(path), component.id);
    const result = await post(path, form, { componentId: component.id, roundId: target.rounds[index].id, templateId: template.id });
    const { data: row } = await db.from("ars_report_template_components").select("round_id").eq("id", component.id).single();
    record(`link "${component.title}" to "${target.rounds[index].name}"`,
      result.location.includes("otice=saved") && row.round_id === target.rounds[index].id, `round_id=${row.round_id}`);
  }

  const unlinkForm = componentForm(await get(path), components[0].id);
  const unlinked = await post(path, unlinkForm, { componentId: components[0].id, roundId: "", templateId: template.id });
  const { data: afterUnlink } = await db.from("ars_report_template_components").select("round_id").eq("id", components[0].id).single();
  record("choosing No round unlinks", unlinked.location.includes("otice=saved") && afterUnlink.round_id === null, `round_id=${afterUnlink.round_id}`);

  // A link made before the programme was chosen must survive in the list, or the
  // select would render "No round" and the next save would drop it.
  await db.from("ars_report_template_components").update({ round_id: other.rounds[0].id }).eq("id", components[0].id).throwOnError();
  const strayForm = componentForm(await get(path), components[0].id);
  const stray = options(strayForm).find((option) => option.id === other.rounds[0].id);
  const selected = new RegExp(`<option[^>]*value="${other.rounds[0].id}"[^>]*selected`).test(strayForm ?? "");
  record("a round linked from another process stays listed, labelled and selected",
    Boolean(stray?.label.includes(other.title)) && selected, stray?.label ?? "missing");
} finally {
  if (made.template) await db.from("ars_report_templates").delete().eq("id", made.template);
  for (const id of made.courses) {
    await db.from("ars_rounds").delete().eq("course_id", id);
    await db.from("courses").delete().eq("id", id);
  }
  if (made.user) {
    await db.from("profiles").delete().eq("id", made.user);
    await db.auth.admin.deleteUser(made.user);
  }
  const after = await counts();
  record("live counts back to baseline", JSON.stringify(after) === JSON.stringify(baseline), JSON.stringify(after));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}
