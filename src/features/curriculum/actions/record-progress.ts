"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parsePositiveId, studentReturnHref } from "../curriculum";

// A student's progress on a document or text item, in the programme it was
// opened from. `item_progress_insert_own` is the gate: the row must be the
// caller's own, the item must sit in that programme, the student must hold it,
// and the type must be one whose progress is stored. Test items are never written; their
// completion is derived from attempts.
//
// ON CONFLICT DO NOTHING rather than an update: completion is one-way, and the
// first completed_at is the one worth keeping.
async function recordComplete(courseId: number, itemId: number, moduleId: number | null) {
  const student = await requireRole("student");
  const supabase = await createServerSupabaseClient();

  const { data: item } = await supabase
    .from("curriculum_items")
    .select("id, type, ref_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) redirect(studentReturnHref(courseId, moduleId));

  const { error } = await supabase.from("item_progress").upsert(
    {
      completed: true,
      completed_at: new Date().toISOString(),
      course_id: courseId,
      item_id: itemId,
      org_id: student.orgId,
      percent: 100,
      student_id: student.id,
    },
    { ignoreDuplicates: true, onConflict: "student_id,course_id,item_id" },
  );

  revalidatePath(`/student/programmes/${courseId}`);
  if (moduleId !== null) revalidatePath(studentReturnHref(courseId, moduleId));
  return { error, item: item as { id: number; ref_id: number | null; type: string } };
}

function ids(formData: FormData) {
  const courseId = parsePositiveId(formData.get("courseId"));
  const itemId = parsePositiveId(formData.get("itemId"));
  if (courseId === null || itemId === null) redirect("/student/programmes");
  // Present only when the item was opened from a module page; anything that is
  // not a positive integer is ignored and the programme page is the way back.
  return { courseId, itemId, moduleId: parsePositiveId(formData.get("moduleId")) };
}

// Opening a document from the programme marks it complete, then goes to the
// existing protected viewer. A failed progress write does not stop the student
// reading: the viewer does its own access check.
export async function openDocumentItemAction(formData: FormData): Promise<void> {
  const { courseId, itemId, moduleId } = ids(formData);
  const { item } = await recordComplete(courseId, itemId, moduleId);
  if (item.type !== "document" || item.ref_id === null) redirect(studentReturnHref(courseId, moduleId));
  redirect(`/student/documents/${item.ref_id}`);
}

export async function markTextReadAction(formData: FormData): Promise<void> {
  const { courseId, itemId, moduleId } = ids(formData);
  const { error } = await recordComplete(courseId, itemId, moduleId);
  redirect(studentReturnHref(courseId, moduleId, error ? "?progress=failed" : ""));
}
