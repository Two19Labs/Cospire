"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildSectionsHref, normaliseSectionName, parseId } from "../list-params";

// The one admin screen the owner chose on 2026-09-21, so the analytics group on
// a fixed list rather than on whatever spelling an author typed.

function parseSortOrder(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return 0;
  if (typeof raw !== "string" || !/^-?\d{1,6}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

function fail(code?: string): never {
  if (code === "23505") redirect(buildSectionsHref({ error: "duplicate" }));
  if (code === "23503") redirect(buildSectionsHref({ error: "in-use" }));
  redirect(buildSectionsHref({ error: "failed" }));
}

export async function createSectionAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const name = normaliseSectionName(formData.get("name"));
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (!name || sortOrder === null) redirect(buildSectionsHref({ error: "invalid" }));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_sections")
    .insert({ name, org_id: admin.orgId, sort_order: sortOrder })
    .select("id");

  if (error || !data || data.length !== 1) fail(error?.code);

  revalidatePath("/admin/questions");
  redirect(buildSectionsHref({ notice: "created" }));
}

export async function updateSectionAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const sectionId = parseId(formData.get("sectionId"));
  const name = normaliseSectionName(formData.get("name"));
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  if (sectionId === null || !name || sortOrder === null) redirect(buildSectionsHref({ error: "invalid" }));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("question_sections")
    .update({ name, sort_order: sortOrder })
    .eq("id", sectionId)
    .select("id");

  if (error || !data || data.length !== 1) fail(error?.code);

  revalidatePath("/admin/questions");
  redirect(buildSectionsHref({ notice: "updated" }));
}

export async function deleteSectionAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const sectionId = parseId(formData.get("sectionId"));
  if (sectionId === null) redirect(buildSectionsHref({ error: "invalid" }));

  const supabase = await createServerSupabaseClient();
  // `questions.section_id` is ON DELETE RESTRICT, so a section still holding a
  // question -- archived ones included -- is refused with 23503.
  const { data, error } = await supabase.from("question_sections").delete().eq("id", sectionId).select("id");

  if (error || !data || data.length !== 1) fail(error?.code);

  revalidatePath("/admin/questions");
  redirect(buildSectionsHref({ notice: "deleted" }));
}
