"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { linkImportRound } from "@/features/ars/queries/round-import";
import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parseBatchId } from "../import-state";
import { normaliseSectionName } from "../list-params";
import { maxMockSections, normaliseMockText, parseMarks, parsePositiveInteger } from "../mock-form";
import { paperQuestionIds, readBatchRows } from "../queries/import-rows";

// Building a mock from an imported paper (D7, D13): the last step of
// mock-first import. The paper's questions are already in the bank -- new ones
// approved, ones it already held linked -- so this only arranges them, in paper
// order, into the paper's sections and calls the same `save_mock` the builder
// uses. There is no second write path for mocks.
//
// Every question must be decided first. A mock built while some were still
// pending would silently leave them out.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A section the paper names and the bank lacks, created from the review screen
// (D14) so the admin is not sent away to the Sections page and back. The same
// insert and name rule as that page; the review re-judges every question
// against the new list when it reloads.
export async function createPaperSectionAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const batchId = parseBatchId(formData.get("batchId"));
  if (batchId === null) redirect("/admin/questions/import");
  const back = `/admin/questions/import/${batchId}${formData.get("mock") === "1" ? "?mock=1&" : "?"}`;
  const name = normaliseSectionName(formData.get("name"));
  if (!name) redirect(`${back}notice=failed`);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("question_sections").insert({ name, org_id: admin.orgId, sort_order: 0 });
  revalidatePath("/admin/questions");
  // 23505: it already exists, which is the state asked for.
  redirect(`${back}notice=${error && error.code !== "23505" ? "failed" : "section-created"}`);
}

export async function buildMockFromImportAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const batchId = parseBatchId(formData.get("batchId"));
  if (batchId === null) redirect("/admin/mocks");
  const fail = (code: string): never => redirect(`/admin/questions/import/${batchId}?mock=1&build=${code}#build`);

  const supabase = await createServerSupabaseClient();
  const rows = await readBatchRows(supabase, batchId);
  if (rows.some((row) => row.status === "pending_review")) fail("pending");
  const topIds = paperQuestionIds(rows);
  if (topIds.length === 0) fail("empty");

  // The paper's questions with their bank sections, and each set's
  // sub-questions, which save_mock needs listed after their passage.
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, type, section_id, archived_at, question_sections(name)")
    .in("id", topIds);
  if (error || !questions || questions.length !== topIds.length) fail("questions");
  if (questions!.some((row) => row.archived_at !== null)) fail("archived");
  const stimulusIds = questions!.filter((row) => row.type === "di_stimulus").map((row) => row.id);
  const childrenOf = new Map<number, number[]>();
  if (stimulusIds.length > 0) {
    const { data: children, error: childError } = await supabase
      .from("questions")
      .select("id, parent_id, archived_at")
      .in("parent_id", stimulusIds)
      .order("id");
    if (childError) fail("questions");
    if ((children ?? []).some((row) => row.archived_at !== null)) fail("archived");
    for (const child of children ?? []) {
      if (child.parent_id !== null) childrenOf.set(child.parent_id, [...(childrenOf.get(child.parent_id) ?? []), child.id]);
    }
  }

  // Sections in the order the paper first uses them.
  const byId = new Map(questions!.map((row) => [row.id, row]));
  const paperSections: Array<{ id: number; name: string; questions: number[] }> = [];
  for (const id of topIds) {
    const row = byId.get(id)!;
    const embedded = Array.isArray(row.question_sections) ? row.question_sections[0] : row.question_sections;
    let section = paperSections.find((entry) => entry.id === row.section_id);
    if (!section) {
      section = { id: row.section_id, name: (embedded as { name?: string } | null)?.name ?? "Section", questions: [] };
      paperSections.push(section);
    }
    section.questions.push(id, ...(childrenOf.get(id) ?? []));
  }

  // Settings, read exactly as the builder reads them.
  const title = normaliseMockText(formData.get("title"));
  const instructions = typeof formData.get("instructions") === "string" ? String(formData.get("instructions")).trim() : "";
  const duration = parsePositiveInteger(formData.get("durationMinutes"), 1440);
  const maxAttempts = parsePositiveInteger(formData.get("maxAttempts"), 100);
  const negativeRaw = formData.get("negativeMarking");
  const negative = typeof negativeRaw === "string" && /^\d+(?:\.\d{1,2})?$/.test(negativeRaw.trim()) ? Number(negativeRaw) : NaN;
  const marks = parseMarks(formData.get("marks"));
  if (!title || title.length > 160 || duration === null || maxAttempts === null || !Number.isFinite(negative) || negative > 100) fail("invalid");
  if (marks === undefined) fail("marks");

  const sectional = formData.get("timingMode") === "sectional";
  let sections: Array<{ durationMinutes: number | null; marks: number | null; questions: number[]; title: string }>;
  if (sectional) {
    if (paperSections.length > maxMockSections) fail("too-many-sections");
    sections = paperSections.map((section) => ({
      durationMinutes: parsePositiveInteger(formData.get(`minutes_${section.id}`), 1440),
      marks: marks ?? null,
      questions: section.questions,
      title: section.name,
    }));
    if (sections.some((section) => section.durationMinutes === null)) fail("minutes");
    if (sections.reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0) !== duration) fail("duration");
  } else {
    sections = [{ durationMinutes: null, marks: marks ?? null, questions: paperSections.flatMap((section) => section.questions), title: "All questions" }];
  }

  const { data: mockId, error: saveError } = await supabase.rpc("save_mock", {
    p_allow_mobile: formData.get("allowMobile") === "on",
    p_duration_minutes: duration!,
    p_instructions: instructions,
    p_max_attempts: maxAttempts!,
    p_mock_id: null,
    p_negative_marking: negative,
    p_negative_marking_types: ["mcq", "mcq_multi", "numerical"].filter((type) => formData.get(`negative_${type}`) === "on"),
    p_proctoring_enabled: formData.get("proctoringEnabled") === "on",
    p_sections: sections,
    p_title: title,
  });
  if (saveError || mockId === null) fail(saveError?.code === "23514" ? "structure" : "failed");

  // Who takes it (D13): the students holding a programme or ARS process, and
  // any picked one by one. A fresh mock has no grants, so this is one insert.
  const picked = formData.getAll("studentId").filter((value): value is string => typeof value === "string" && uuidPattern.test(value));
  const courseId = parsePositiveInteger(formData.get("grantCourseId"), Number.MAX_SAFE_INTEGER);
  let holders: string[] = [];
  if (courseId !== null) {
    const { data: grants } = await supabase
      .from("content_access")
      .select("student_id")
      .eq("resource_type", "course")
      .eq("resource_id", courseId);
    holders = (grants ?? []).map((grant) => String(grant.student_id));
  }
  const students = [...new Set([...picked, ...holders])];
  let grantFailed = false;
  if (students.length > 0) {
    const { error: grantError } = await supabase.from("content_access").insert(
      students.map((studentId) => ({
        granted_by: admin.id,
        org_id: admin.orgId,
        resource_id: Number(mockId),
        resource_type: "mock",
        student_id: studentId,
      })),
    );
    grantFailed = grantError !== null;
  }

  // An import started from an ARS aptitude round (D8) links the new mock to
  // that round, through the admin's own session as setRoundMockAction does.
  const roundLink = await linkImportRound(batchId, Number(mockId));
  if (roundLink !== "none") revalidatePath("/student/ars");

  revalidatePath("/admin/mocks");
  const notice = grantFailed ? "built-grant-failed" : roundLink === "linked" ? "built-linked" : roundLink === "failed" ? "built-link-failed" : "built";
  redirect(`/admin/mocks/${mockId}?notice=${notice}`);
}
