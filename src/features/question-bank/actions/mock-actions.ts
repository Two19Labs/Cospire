"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { mapSectionSlots, maxMockSections, normaliseMockText, parsePositiveInteger, parseSectionSlot } from "../mock-form";

function fail(mockId: number | null, code: string): never {
  redirect(mockId === null ? `/admin/mocks/new?error=${code}` : `/admin/mocks/${mockId}?error=${code}`);
}

export async function saveMockAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const rawId = formData.get("mockId");
  const mockId = rawId === null || rawId === "" ? null : parsePositiveInteger(rawId, Number.MAX_SAFE_INTEGER);
  if (rawId !== null && rawId !== "" && mockId === null) fail(null, "invalid");

  const title = normaliseMockText(formData.get("title"));
  const instructions = typeof formData.get("instructions") === "string" ? String(formData.get("instructions")).trim() : "";
  const duration = parsePositiveInteger(formData.get("durationMinutes"), 1440);
  const maxAttempts = parsePositiveInteger(formData.get("maxAttempts"), 100);
  const negativeRaw = formData.get("negativeMarking");
  const negative = typeof negativeRaw === "string" && /^\d+(?:\.\d{1,2})?$/.test(negativeRaw.trim()) ? Number(negativeRaw) : NaN;
  if (!title || title.length > 160 || duration === null || maxAttempts === null || !Number.isFinite(negative) || negative < 0 || negative > 100) {
    fail(mockId, "invalid");
  }

  const timingMode = formData.get("timingMode") === "sectional" ? "sectional" : "overall";
  const sections: Array<{ title: string; durationMinutes: number | null; questions: number[] }> = [];
  const sectionCount = timingMode === "overall" ? 1 : maxMockSections;

  // A question's dropdown posts the SLOT it was drawn from -- "Section 3" is
  // slot 2 whether or not slots 0 and 1 were filled in. Blank slots are dropped
  // here, so slot and position part company the moment one is left empty, and
  // mapping one to the other by position files questions into the wrong section
  // or fails the save with "One or more selected questions are unavailable."
  const slotOfSection: number[] = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionTitle = timingMode === "overall" ? "All questions" : normaliseMockText(formData.get(`sectionTitle_${index}`));
    if (!sectionTitle) continue;
    const sectionDuration = timingMode === "overall" ? null : parsePositiveInteger(formData.get(`sectionDuration_${index}`), 1440);
    if (timingMode === "sectional" && sectionDuration === null) fail(mockId, "sections");
    slotOfSection.push(index);
    sections.push({ title: sectionTitle, durationMinutes: sectionDuration, questions: [] });
  }
  const sectionBySlot = mapSectionSlots(slotOfSection);
  if (sections.length === 0) fail(mockId, "sections");
  if (timingMode === "sectional" && sections.reduce((sum, section) => sum + (section.durationMinutes ?? 0), 0) !== duration) {
    fail(mockId, "duration");
  }

  const rootIds = formData.getAll("questionId").map((value) => parsePositiveInteger(value, Number.MAX_SAFE_INTEGER));
  if (rootIds.some((value) => value === null)) fail(mockId, "questions");
  const uniqueRoots = [...new Set(rootIds as number[])];
  const supabase = await createServerSupabaseClient();
  if (uniqueRoots.length > 0) {
    const { data: roots, error: rootError } = await supabase
      .from("questions")
      .select("id,type,archived_at")
      .in("id", uniqueRoots)
      .is("parent_id", null);
    if (rootError || !roots || roots.length !== uniqueRoots.length) fail(mockId, "questions");
    // Archived separately from missing: a question archived after it was picked
    // is the one case the author can fix from the screen, and it needs to say so
    // rather than read as "unavailable".
    if (roots.some((row) => row.archived_at !== null)) fail(mockId, "archived");
    const stimulusIds = roots.filter((row) => row.type === "di_stimulus").map((row) => row.id);
    const childrenByParent = new Map<number, number[]>();
    if (stimulusIds.length > 0) {
      const { data: children, error: childError } = await supabase
        .from("questions")
        .select("id,parent_id,archived_at")
        .in("parent_id", stimulusIds)
        .order("id");
      if (childError) fail(mockId, "questions");
      if ((children ?? []).some((row) => row.archived_at !== null)) fail(mockId, "archived");
      for (const child of children ?? []) {
        if (child.parent_id === null) continue;
        childrenByParent.set(child.parent_id, [...(childrenByParent.get(child.parent_id) ?? []), child.id]);
      }
    }
    for (const rootId of uniqueRoots) {
      // Absent or malformed reads as a refusal, never as section one: a missing
      // field means the post did not come from the form as rendered, and
      // silently filing the question somewhere is worse than saying no.
      const slot = timingMode === "overall" ? 0 : parseSectionSlot(formData.get(`questionSection_${rootId}`));
      const target = timingMode === "overall" ? 0 : (slot === null ? undefined : sectionBySlot.get(slot));
      if (target === undefined) fail(mockId, "section-missing");
      sections[target].questions.push(rootId, ...(childrenByParent.get(rootId) ?? []));
    }
  }

  const negativeTypes = ["mcq", "mcq_multi", "numerical"].filter((type) => formData.get(`negative_${type}`) === "on");
  const { data, error } = await supabase.rpc("save_mock", {
    p_allow_mobile: formData.get("allowMobile") === "on",
    p_duration_minutes: duration,
    p_instructions: instructions,
    p_max_attempts: maxAttempts,
    p_mock_id: mockId,
    p_negative_marking: negative,
    p_negative_marking_types: negativeTypes,
    p_proctoring_enabled: formData.get("proctoringEnabled") === "on",
    p_sections: sections,
    p_title: title,
  });
  if (error || data === null) fail(mockId, error?.code === "23514" ? "structure" : "failed");
  revalidatePath("/admin/mocks");
  redirect(`/admin/mocks/${data}?notice=saved`);
}
