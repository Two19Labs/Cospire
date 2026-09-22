// Checks, against a running build, that the detail screens stream a skeleton of
// their own (not their parent list's) and that signing in lands on the role's
// home in one redirect rather than going through /dashboard. Throwaway accounts,
// removed in finally.
//
// node --env-file=.env.local scripts/verify/loading-coverage.mjs http://127.0.0.1:3100

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const db = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `LoadVerify${stamp}x`;
const people = {};
const results = [];

function record(name, pass, detail = "") {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function person(role, status = "active") {
  const email = `load-verify-${role}-${status}-${stamp}@example.com`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  const key = status === "active" ? role : `${role}-${status}`;
  people[key] = { email, id: data.user.id };
  await db.from("profiles").insert({ email, id: data.user.id, name: `Load ${role}`, org_id: 1, role, status }).throwOnError();
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (list) => jar.push(...list) } });
  await ssr.auth.signInWithPassword({ email, password });
  people[key].cookie = jar.map((c) => `${c.name}=${c.value}`).join("; ");
}

// The loading fallbacks in the first chunk the server flushes: what the browser
// paints while the page itself is still loading. Only the fallback regions React
// marks with <!--$?--> ... <!--/$--> are searched, because a fast page (these ids
// do not exist) can finish inside the same chunk and its own content must not
// count. A parent's skeleton can sit there ahead of the route's own, which React
// swaps in as the chunk is parsed, so the test is that the route's own skeleton
// is among them. Each marker is one only that skeleton produces.
async function firstFallbacks(path, who) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie: people[who].cookie }, redirect: "manual" });
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const chunk = new TextDecoder().decode(value);
  return [...chunk.matchAll(/<!--\$\?-->([\s\S]*?)<!--\/\$-->/g)].map((match) => match[1]).join("\n");
}

const detailScreens = [
  // [path, role, marker only this route's own skeleton produces]
  ["/student/reports/999999999", "student", "Your ARS report"],
  ["/student/documents/999999999", "student", "skeleton--title"],
  ["/mentor/reports/999999999", "mentor", "skeleton--input"],
  ["/admin/documents/999999999", "admin", "skeleton--title"],
  ["/admin/report-templates/999999999", "admin", "skeleton--input"],
  ["/admin/report-templates/import", "admin", "Import report template"],
  ["/admin/ars/999999999/rounds/999999999", "admin", "skeleton--input"],
];

async function loginDestination(email) {
  const page = await (await fetch(`${BASE}/login`)).text();
  const form = page.match(/<form[\s\S]*?<\/form>/)?.[0] ?? "";
  const body = new FormData();
  for (const match of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = match[0].match(/name="([^"]*)"/)?.[1];
    const value = match[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) body.set(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  body.set("email", email);
  body.set("password", password);
  const response = await fetch(`${BASE}/login`, { body, method: "POST", redirect: "manual" });
  return { location: response.headers.get("location") ?? "", status: response.status };
}

try {
  for (const role of ["admin", "mentor", "student"]) await person(role);
  await person("student", "disabled");

  for (const [path, who, marker] of detailScreens) {
    const fallbacks = await firstFallbacks(path, who);
    record(`${path} streams its own skeleton first`, fallbacks.includes(marker), marker);
  }

  for (const role of ["admin", "mentor", "student"]) {
    const result = await loginDestination(people[role].email);
    record(`${role} sign-in goes straight to /${role}`, result.status === 303 && result.location.endsWith(`/${role}`), `${result.status} -> ${result.location}`);
  }
  const inactive = await loginDestination(people["student-disabled"].email);
  record("disabled account still goes through /dashboard", inactive.location.endsWith("/dashboard"), `${inactive.status} -> ${inactive.location}`);
} finally {
  for (const p of Object.values(people)) {
    await db.from("profiles").delete().eq("id", p.id);
    await db.auth.admin.deleteUser(p.id);
  }
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}
