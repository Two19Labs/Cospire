"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import {
  nextSortOrder,
  parseDirection,
  parsePositiveId,
  planMove,
  type CurriculumMessage,
} from "@/features/curriculum/curriculum";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { attachFailure, mocksSectionFailure, mocksSectionTitle, toOrdered } from "../attachments";

// Attaching modules to a programme's subjects, and the programme's single
// full-mocks section. Thin: RLS (`section_modules_*_admin`, `sections_*_admin`)
// decides who may write; the primary key, the partial unique index and the
// triggers refuse a duplicate, a second mocks section and a module on the
// mocks section, and `attachFailure` turns those into sentences.

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

export async function attachModuleAction(formData: FormData): Promise<void> {
  const { admin, courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const moduleId = parsePositiveId(formData.get("moduleId"));
  if (sectionId === null || moduleId === null) back(courseId, "module-attach-failed");

  // The subject must belong to this programme (read through RLS).
  const { data: section } = await supabase
    .from("sections")
    .select("id, kind")
    .eq("id", sectionId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!section) back(courseId, "module-attach-failed");
  if (section.kind === "mocks") back(courseId, "mocks-no-modules");

  const { data: existing, error: readError } = await supabase
    .from("section_modules")
    .select("module_id, sort_order")
    .eq("section_id", sectionId)
    .limit(2000);
  if (readError) back(courseId, "module-attach-failed");

  const { error } = await supabase.from("section_modules").insert({
    module_id: moduleId,
    org_id: admin.orgId,
    section_id: sectionId,
    sort_order: nextSortOrder(toOrdered(existing.map((row) => ({ moduleId: row.module_id, sortOrder: row.sort_order })))),
  });
  back(courseId, error ? attachFailure(error) : "module-attached");
}

export async function detachModuleAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const moduleId = parsePositiveId(formData.get("moduleId"));
  if (sectionId === null || moduleId === null) back(courseId, "change-failed");

  // Counting rows: RLS filtering a delete to nothing is not an error.
  const { data, error } = await supabase
    .from("section_modules")
    .delete()
    .eq("section_id", sectionId)
    .eq("module_id", moduleId)
    .select("module_id");
  back(courseId, error || (data ?? []).length !== 1 ? "change-failed" : "module-detached");
}

export async function moveAttachedModuleAction(formData: FormData): Promise<void> {
  const { courseId, supabase } = await start(formData);
  const sectionId = parsePositiveId(formData.get("sectionId"));
  const moduleId = parsePositiveId(formData.get("moduleId"));
  const direction = parseDirection(formData.get("direction"));
  if (sectionId === null || moduleId === null || direction === null) back(courseId, "change-failed");

  const { data, error } = await supabase
    .from("section_modules")
    .select("module_id, sort_order")
    .eq("section_id", sectionId)
    .limit(2000);
  if (error) back(courseId, "change-failed");

  // Sequential, as the item builder does: see `planMove` for why a partial
  // write still leaves a valid order.
  const changes = planMove(toOrdered(data.map((row) => ({ moduleId: row.module_id, sortOrder: row.sort_order }))), moduleId, direction);
  for (const change of changes) {
    const { data: updated, error: updateError } = await supabase
      .from("section_modules")
      .update({ sort_order: change.sortOrder })
      .eq("section_id", sectionId)
      .eq("module_id", change.id)
      .select("module_id");
    if (updateError || (updated ?? []).length !== 1) back(courseId, "change-failed");
  }
  back(courseId, "moved");
}

export async function addMocksSectionAction(formData: FormData): Promise<void> {
  const { admin, courseId, supabase } = await start(formData);

  const { data: existing, error: readError } = await supabase
    .from("sections")
    .select("id, sort_order")
    .eq("course_id", courseId)
    .limit(200);
  if (readError) back(courseId, "mocks-failed");

  const { error } = await supabase.from("sections").insert({
    course_id: courseId,
    kind: "mocks",
    org_id: admin.orgId,
    sort_order: nextSortOrder(existing.map((row) => ({ id: row.id, sortOrder: row.sort_order }))),
    title: mocksSectionTitle,
  });
  back(courseId, error ? mocksSectionFailure(error) : "mocks-added");
}
