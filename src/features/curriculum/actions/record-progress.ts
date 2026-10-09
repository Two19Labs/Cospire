"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { parsePositiveId } from "../curriculum";

// A student's progress on a document or text item. `item_progress_insert_own`
// is the gate: the row must be the caller's own, in a programme they hold, and
// of a type whose progress is stored. Test items are never written; their
// completion is derived from attempts.
//
// ON CONFLICT DO NOTHING rather than an update: completion is one-way, and the
// first completed_at is the one worth keeping.
async function recordComplete(courseId: number, itemId: number) {
  const student = await requireRole("student");
  const supabase = await createServerSupabaseClient();

  const { data: item } = await supabase
    .from("curriculum_items")
    .select("id, type, ref_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) redirect(`/student/programmes/${courseId}`);

  const { error } = await supabase.from("item_progress").upsert(
    {
      completed: true,
      completed_at: new Date().toISOString(),
      item_id: itemId,
      org_id: student.orgId,
      percent: 100,
      student_id: student.id,
    },
    { ignoreDuplicates: true, onConflict: "student_id,item_id" },
  );

  revalidatePath(`/student/programmes/${courseId}`);
  return { error, item: item as { id: number; ref_id: number | null; type: string } };
}

function ids(formData: FormData) {
  const courseId = parsePositiveId(formData.get("courseId"));
  const itemId = parsePositiveId(formData.get("itemId"));
  if (courseId === null || itemId === null) redirect("/student/programmes");
  return { courseId, itemId };
}

// Opening a document from the programme marks it complete, then goes to the
// existing protected viewer. A failed progress write does not stop the student
// reading: the viewer does its own access check.
export async function openDocumentItemAction(formData: FormData): Promise<void> {
  const { courseId, itemId } = ids(formData);
  const { item } = await recordComplete(courseId, itemId);
  if (item.type !== "document" || item.ref_id === null) redirect(`/student/programmes/${courseId}`);
  redirect(`/student/documents/${item.ref_id}`);
}

export async function markTextReadAction(formData: FormData): Promise<void> {
  const { courseId, itemId } = ids(formData);
  const { error } = await recordComplete(courseId, itemId);
  redirect(`/student/programmes/${courseId}${error ? "?progress=failed" : ""}`);
}
