// Shared modules slice 5 (student side) against the hosted database, as a
// throwaway student through RLS: a module attached to subjects of two
// programmes is visible only through a held programme, and its progress is
// counted per programme. Throwaway admin-free: fixtures are made with the
// service client (as curriculum.mjs does) and removed in `finally`.
//
// node --env-file=.env.local scripts/verify/modules-5.mjs

import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !PUB || !SECRET) throw new Error("missing supabase env");

const service = createClient(URL_, SECRET, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const password = `Modules5Verify${randomUUID()}`;
const made = { courses: [], modules: [], users: [] };
let failures = 0;

function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures += 1;
}
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

async function student(key, role = "student") {
  const email = `modules5-${key}-${stamp}@example.com`;
  const user = must(await service.auth.admin.createUser({ email, email_confirm: true, password })).user;
  made.users.push(user.id);
  must(await service.from("profiles").insert({ email, id: user.id, name: `Modules5 ${key}`, org_id: 1, role }));
  const jar = [];
  const ssr = createServerClient(URL_, PUB, { cookies: { getAll: () => [], setAll: (v) => jar.push(...v) } });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return {
    client: createClient(URL_, PUB, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }),
    id: user.id,
  };
}

let adminId = null;
const grant = (studentId, courseId) =>
  service.from("content_access").insert({ granted_by: adminId, org_id: 1, resource_id: courseId, resource_type: "course", student_id: studentId });

// What the student programme page counts for one module in one programme:
// only this programme's item_progress rows (the rule is unit-tested in
// curriculum.test.ts; this reads the same rows through RLS).
async function moduleProgress(s, courseId, moduleId) {
  const [items, stored] = await Promise.all([
    s.client.from("curriculum_items").select("id").eq("module_id", moduleId),
    s.client.from("item_progress").select("item_id").eq("student_id", s.id).eq("course_id", courseId).eq("completed", true),
  ]);
  const ids = new Set((items.data ?? []).map((i) => i.id));
  return { complete: (stored.data ?? []).filter((r) => ids.has(r.item_id)).length, total: ids.size };
}

try {
  adminId = (await student("admin", "admin")).id; // a throwaway admin to be the granter
  const a = await student("a");
  const b = await student("b");

  const P1 = must(await service.from("courses").insert({ kind: "programme", org_id: 1, title: `M5 P1 ${stamp}` }).select("id").single()).id;
  const P2 = must(await service.from("courses").insert({ kind: "programme", org_id: 1, title: `M5 P2 ${stamp}` }).select("id").single()).id;
  made.courses.push(P1, P2);
  const S1 = must(await service.from("sections").insert({ course_id: P1, org_id: 1, title: "QA", kind: "subject" }).select("id").single()).id;
  const S2 = must(await service.from("sections").insert({ course_id: P2, org_id: 1, title: "QA", kind: "subject" }).select("id").single()).id;
  const mocks = must(await service.from("sections").insert({ course_id: P1, org_id: 1, title: "Mocks", kind: "mocks", sort_order: -1 }).select("id, kind").single());
  const M = must(await service.from("modules").insert({ org_id: 1, title: `M5 module ${stamp}` }).select("id").single()).id;
  made.modules.push(M);
  await Promise.all([S1, S2].map(async (sid) => must(await service.from("section_modules").insert({ module_id: M, org_id: 1, section_id: sid }))));
  const items = [];
  for (const [i, title] of ["One", "Two"].entries()) {
    items.push(must(await service.from("curriculum_items").insert({ body: "Read.", module_id: M, org_id: 1, sort_order: i, title, type: "text" }).select("id").single()).id);
  }

  check("the mocks section is of kind mocks", mocks.kind === "mocks");

  // No grant: nothing is visible.
  check("a student with no programme sees no module", (must(await a.client.from("modules").select("id").eq("id", M))).length === 0);
  check("... nor its items", (must(await a.client.from("curriculum_items").select("id").eq("module_id", M))).length === 0);

  // Grant P1 to a: module and items visible, through the attachment.
  must(await grant(a.id, P1));
  check("a programme grant shows the module", (must(await a.client.from("modules").select("id").eq("id", M))).length === 1);
  check("... its attachment", (must(await a.client.from("section_modules").select("section_id").eq("module_id", M))).length >= 1);
  check("... and its items, in order", (must(await a.client.from("curriculum_items").select("id").eq("module_id", M).order("sort_order"))).map((r) => r.id).join() === items.join());
  check("another student still sees nothing", (must(await b.client.from("modules").select("id").eq("id", M))).length === 0);

  // Progress is per programme.
  must(await a.client.from("item_progress").insert({ completed: true, completed_at: new Date().toISOString(), course_id: P1, item_id: items[0], org_id: 1, percent: 100, student_id: a.id }));
  let p1 = await moduleProgress(a, P1, M);
  let p2 = await moduleProgress(a, P2, M);
  check("progress written in P1 counts 1 of 2 in P1", p1.complete === 1 && p1.total === 2, JSON.stringify(p1));
  check("... and 0 of 2 in P2", p2.complete === 0 && p2.total === 2, JSON.stringify(p2));

  // Record the same item in P2: the student must hold P2 first.
  const refused = await a.client.from("item_progress").insert({ completed: true, course_id: P2, item_id: items[1], org_id: 1, percent: 100, student_id: a.id });
  check("progress in a programme the student does not hold is refused", Boolean(refused.error));
  must(await grant(a.id, P2));
  must(await a.client.from("item_progress").insert({ completed: true, completed_at: new Date().toISOString(), course_id: P2, item_id: items[1], org_id: 1, percent: 100, student_id: a.id }));
  p1 = await moduleProgress(a, P1, M);
  p2 = await moduleProgress(a, P2, M);
  check("the same module has independent progress: P1 1/2, P2 1/2", p1.complete === 1 && p2.complete === 1, `${JSON.stringify(p1)} ${JSON.stringify(p2)}`);

  // Revoking P1 leaves the P2 path.
  must(await service.from("content_access").delete().eq("student_id", a.id).eq("resource_id", P1));
  check("revoking P1 leaves the module visible through P2", (must(await a.client.from("modules").select("id").eq("id", M))).length === 1);
} finally {
  const failed = [];
  const attempt = async (label, run) => {
    const { error } = await run();
    if (error) failed.push(`${label}: ${error.message}`);
  };
  if (made.users.length) {
    await attempt("progress", () => service.from("item_progress").delete().in("student_id", made.users));
    await attempt("grants", () => service.from("content_access").delete().in("student_id", made.users));
  }
  // Deleting a module cascades its items and attachments; a course its sections.
  if (made.modules.length) await attempt("modules", () => service.from("modules").delete().in("id", made.modules));
  if (made.courses.length) await attempt("courses", () => service.from("courses").delete().in("id", made.courses));
  for (const id of made.users) {
    await attempt(`profile ${id}`, () => service.from("profiles").delete().eq("id", id));
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) failed.push(`user ${id}: ${error.message}`);
  }
  for (const line of failed) console.log(`cleanup FAILED: ${line}`);
  console.log(failed.length ? "CLEANUP INCOMPLETE" : "cleaned up");
  if (failures || failed.length) process.exitCode = 1;
}
