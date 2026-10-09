"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  nextSortOrder,
  normaliseBody,
  normaliseTitle,
  parseDirection,
  parseItemType,
  parsePositiveId,
  planMove,
  type CurriculumMessage,
} from "../curriculum";

// The curriculum builder's writes. Thin on purpose: RLS decides who may write
// (`*_insert_admin` and friends), the triggers refuse a section on an ARS
// process and an item naming another organisation's document or mock, and the
// check constraints refuse a malformed text item. None of that is restated
// here beyond turning bad input into a sentence.

function back(courseId: number, message: CurriculumMessage): never {
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}?curriculum=${message}#curriculum`);
}

async function start(formData: FormData) {
  const admin = await requireRole("admin");
  const courseId = parsePositiveId(formData.get("courseId"));
  if (courseId === null) redirect("/admin/courses?error=invalid-request");
  return { admin, courseId, supabase: await createServerSupabaseClient() };
}

async function applyMove(
  table: "sections" | "curriculum_items",
  rows: { id: number; sort_order: number }[],
  id: number,
  direction: "up" | "down",
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const changes = planMove(
    rows.map((row) => ({ id: row.id, sortOrder: row.sort_order })),
    id,
    direction,
  );
  // Sequential and not in one transaction: see planMove for why a partial
  // write still leaves a valid order.
  for (const change of changes) {
    const { data, error } = await supabase
      .from(table)
      .update({ sort_order: change.sortOrder })
      .eq("id", change.id)
      .select("id");
    if (error || (data ?? []).length !== 1) return false;
  }
  return true;
}

export async function addSectionAction(formData: FormData): Promise<void> {
  const { admin, courseId, supabase } = await start(formData);
  const title = normaliseTitle(formData.get("title"));
  if (title === null) back(courseId, "section-failed");

  const { data: existing } = await supabase
    .from("sections")
    .select("id, sort_order")
    .eq("course_id", courseId)
    .limit(200);

  const { error } = await supabase.from("sections").insert({
    course_id: courseId,
    org_id: admin.orgId,
    sort_order: nextSortOrder(
      (existing ?? []).map((row) => ({ id: row.id as number, sortOrder: row.sort_order as number })),
    ),
    title,
  });
  back(courseId, error ? "section-failed" : "section-added");
}

export async function removeSectionAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  if (sectionId === null) back(courseId, "change-failed");

  // Counting rows: RLS filtering a delete to nothing is not an error.
  const { data, error } = await supabase
    .from("sections")
    .delete()
    .eq("id", sectionId)
    .eq("course_id", courseId)
    .select("id");
  back(courseId, error || (data ?? []).length !== 1 ? "change-failed" : "section-removed");
}

export async function moveSectionAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const direction = parseDirection(formData.get("direction"));
  if (sectionId === null || direction === null) back(courseId, "change-failed");

  const { data, error } = await supabase
    .from("sections")
    .select("id, sort_order")
    .eq("course_id", courseId)
    .limit(200);
  if (error) back(courseId, "change-failed");

  const ok = await applyMove("sections", data ?? [], sectionId, direction);
  back(courseId, ok ? "moved" : "change-failed");
}

export async function addItemAction(formData: FormData): Promise<void> {
  const { admin, courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const type = parseItemType(formData.get("type"));
  if (sectionId === null || type === null) back(courseId, "item-failed");

  // The section must belong to this programme. Read through RLS, so a section
  // in another organisation is simply not found.
  const { data: section } = await supabase
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!section) back(courseId, "item-failed");

  let fields: { body?: string; ref_id?: number; title?: string };
  if (type === "text") {
    const title = normaliseTitle(formData.get("title"));
    const body = normaliseBody(formData.get("body"));
    if (title === null || body === null) back(courseId, "item-failed");
    fields = { body, title };
  } else {
    const refId = parsePositiveId(formData.get("refId"));
    if (refId === null) back(courseId, "item-failed");
    fields = { ref_id: refId };
  }

  const { data: existing } = await supabase
    .from("curriculum_items")
    .select("id, sort_order")
    .eq("section_id", sectionId)
    .limit(2000);

  const { error } = await supabase.from("curriculum_items").insert({
    ...fields,
    org_id: admin.orgId,
    section_id: sectionId,
    sort_order: nextSortOrder(
      (existing ?? []).map((row) => ({ id: row.id as number, sortOrder: row.sort_order as number })),
    ),
    type,
  });
  back(courseId, error ? "item-failed" : "item-added");
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const itemId = parsePositiveId(formData.get("itemId"));
  if (itemId === null) back(courseId, "change-failed");

  const { data, error } = await supabase
    .from("curriculum_items")
    .delete()
    .eq("id", itemId)
    .select("id");
  back(courseId, error || (data ?? []).length !== 1 ? "change-failed" : "item-removed");
}

export async function moveItemAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const itemId = parsePositiveId(formData.get("itemId"));
  const direction = parseDirection(formData.get("direction"));
  if (sectionId === null || itemId === null || direction === null) back(courseId, "change-failed");

  const { data, error } = await supabase
    .from("curriculum_items")
    .select("id, sort_order")
    .eq("section_id", sectionId)
    .limit(2000);
  if (error) back(courseId, "change-failed");

  const ok = await applyMove("curriculum_items", data ?? [], itemId, direction);
  back(courseId, ok ? "moved" : "change-failed");
}
