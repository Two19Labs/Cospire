// The signed-in routes of every role, with the fixture's ids filled in.
// Shared by ui-audit-latency.mjs and ui-audit-browser.mjs.
export async function buildRoutes(state, service) {
  const ids = state.ids;
  const { data: sub } = await service.from("ars_submissions").select("id").eq("round_id", ids.textRound).eq("student_id", state.people.student.id).single();
  const { data: items } = await service.from("curriculum_items").select("id, type").eq("org_id", 1).in("section_id", (await service.from("sections").select("id").eq("course_id", ids.course)).data.map((s) => s.id));
  const textItem = items.find((i) => i.type === "text").id;
  const docs = state.made.documents;

  return {
    admin: [
      "/admin", "/admin/users", "/admin/users/new", "/admin/activity", "/admin/courses", `/admin/courses/${ids.course}`,
      "/admin/ars", `/admin/ars/${ids.ars}`, `/admin/ars/${ids.ars}/rounds/${ids.textRound}`, `/admin/ars/${ids.ars}/import`,
      "/admin/ars-submissions", `/admin/ars-submissions/${sub.id}`, "/admin/questions", `/admin/questions/${ids.q1}`,
      "/admin/questions/new", "/admin/questions/sections", "/admin/questions/import", "/admin/mocks", `/admin/mocks/${ids.mockB}`,
      "/admin/mocks/new", "/admin/mocks/import", "/admin/mocks/import-paper", "/admin/analytics", `/admin/analytics/mocks/${ids.mockB}`,
      `/admin/analytics/students/${state.people.student.id}`, `/admin/analytics/attempts/${ids.attemptB}`, "/admin/documents",
      `/admin/documents/${docs[0]}`, "/admin/report-templates", `/admin/report-templates/${ids.template}`, "/admin/report-templates/import",
    ],
    mentor: [
      "/mentor", `/mentor/ars/${sub.id}`, `/mentor/reports/${ids.report}`, "/mentor/questions", `/mentor/questions/${ids.q1}`,
      "/mentor/questions/new", "/mentor/analytics", `/mentor/analytics/attempts/${ids.attemptB}`,
    ],
    student: [
      "/student", "/student/programmes", `/student/programmes/${ids.course}`, `/student/programmes/${ids.course}/items/${textItem}`,
      "/student/documents", `/student/documents/${docs[2]}`, "/student/mocks", `/student/mocks/${ids.mockA}`,
      `/student/attempts/${ids.attemptB}`, "/student/analytics", `/student/analytics/attempts/${ids.attemptB}`, "/student/ars",
      `/student/ars/${ids.rounds[1]}`, `/student/reports/${ids.report}`,
    ],
  };
}

// Fresh sessions for every fixture account: the cookies setup saved may be past
// their hour, and replaying a rotated refresh token would end the session.
export async function freshCookies(state) {
  const { createServerClient } = await import("@supabase/ssr");
  for (const p of Object.values(state.people)) {
    if (p.nologin) continue;
    const jar = [];
    const ssr = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => [], setAll: (v) => jar.push(...v) } });
    const { error } = await ssr.auth.signInWithPassword({ email: p.email, password: state.password });
    if (error) throw error;
    p.cookie = jar.map((c) => `${c.name}=${c.value}`).join("; ");
  }
}
