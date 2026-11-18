"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import {
  nextSortOrder,
  normaliseBody,
  parseDirection,
  parseItemType,
  planMove,
} from "@/features/curriculum/curriculum";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  buildModuleHref,
  buildModulesHref,
  copyTitle,
  normaliseTitle,
  parsePositiveId,
  type ModuleMessage,
} from "../modules";

// The module library's writes. Thin: RLS (`modules_*_admin`,
// `curriculum_items_*_admin`) decides who may write and the database triggers
// refuse an item naming another organisation's document or mock. Destinations
// are built from parsed values, never from a form field.

function back(moduleId: number, message: ModuleMessage): never {
  revalidatePath(`/admin/modules/${moduleId}`);
  redirect(buildModuleHref(moduleId, message));
}

async function start(formData: FormData) {
  const admin = await requireRole("admin");
  const moduleId = parsePositiveId(formData.get("moduleId"));
  if (moduleId === null) redirect(buildModulesHref({ message: "invalid-request", page: 1, search: "" }));
  return { admin, moduleId, supabase: await createServerSupabaseClient() };
}

export async function createModuleAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const title = normaliseTitle(formData.get("title"));
  if (title === null) redirect(buildModulesHref({ message: "title-invalid", page: 1, search: "" }));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("modules").insert({ org_id: admin.orgId, title }).select("id").single();
  if (error || !data) redirect(buildModulesHref({ message: "create-failed", page: 1, search: "" }));

  revalidatePath("/admin/modules");
  redirect(buildModuleHref(data.id, "created"));
}

export async function renameModuleAction(formData: FormData): Promise<void> {
  const { moduleId, supabase } = await start(formData);
  const title = normaliseTitle(formData.get("title"));
  if (title === null) back(moduleId, "title-invalid");

  const { data, error } = await supabase.from("modules").update({ title }).eq("id", moduleId).select("id");
  revalidatePath("/admin/modules");
  back(moduleId, error || (data ?? []).length !== 1 ? "rename-failed" : "renamed");
}

// A variation starts as a copy: the title plus " (copy)" and every item in
// order. Attachments are deliberately not copied.
export async function duplicateModuleAction(formData: FormData): Promise<void> {
  const { admin, moduleId, supabase } = await start(formData);

  const [source, items] = await Promise.all([
    supabase.from("modules").select("title").eq("id", moduleId).maybeSingle(),
    supabase
      .from("curriculum_items")
      .select("type, ref_id, title, body, sort_order")
      .eq("module_id", moduleId)
      .order("sort_order")
      .order("id")
      .limit(2000),
  ]);
  if (source.error || !source.data || items.error) back(moduleId, "duplicate-failed");

  const { data: created, error } = await supabase
    .from("modules")
    .insert({ org_id: admin.orgId, title: copyTitle(source.data.title) })
    .select("id")
    .single();
  if (error || !created) back(moduleId, "duplicate-failed");

  const rows = (items.data ?? []).map((item, position) => ({
    body: item.body,
    module_id: created.id,
    org_id: admin.orgId,
    ref_id: item.ref_id,
    sort_order: position,
    title: item.title,
    type: item.type,
  }));
  if (rows.length > 0) {
    const { error: copyError } = await supabase.from("curriculum_items").insert(rows);
    if (copyError) {
      // Never leave a half-copied module behind.
      await supabase.from("modules").delete().eq("id", created.id);
      back(moduleId, "duplicate-failed");
    }
  }

  revalidatePath("/admin/modules");
  redirect(buildModuleHref(created.id, "duplicated"));
}

export async function addModuleItemAction(formData: FormData): Promise<void> {
  const { admin, moduleId, supabase } = await start(formData);
  const type = parseItemType(formData.get("type"));
  if (type === null) back(moduleId, "item-failed");

  const fields =
    type === "text"
      ? { body: normaliseBody(formData.get("body")), title: normaliseTitle(formData.get("title")) }
      : { ref_id: parsePositiveId(formData.get("refId")) };
  if (Object.values(fields).some((value) => value === null)) back(moduleId, "item-failed");

  const { data: existing, error: readError } = await supabase
    .from("curriculum_items")
    .select("id, sort_order")
    .eq("module_id", moduleId)
    .limit(2000);
  if (readError) back(moduleId, "item-failed");

  const { error } = await supabase.from("curriculum_items").insert({
    ...fields,
    module_id: moduleId,
    org_id: admin.orgId,
    sort_order: nextSortOrder((existing ?? []).map((row) => ({ id: row.id, sortOrder: row.sort_order }))),
    type,
  });
  back(moduleId, error ? "item-failed" : "item-added");
}

export async function removeModuleItemAction(formData: FormData): Promise<void> {
  const { moduleId, supabase } = await start(formData);
  const itemId = parsePositiveId(formData.get("itemId"));
  if (itemId === null) back(moduleId, "change-failed");

  const { data, error } = await supabase
    .from("curriculum_items")
    .delete()
    .eq("id", itemId)
    .eq("module_id", moduleId)
    .select("id");
  back(moduleId, error || (data ?? []).length !== 1 ? "change-failed" : "item-removed");
}

export async function moveModuleItemAction(formData: FormData): Promise<void> {
  const { moduleId, supabase } = await start(formData);
  const itemId = parsePositiveId(formData.get("itemId"));
  const direction = parseDirection(formData.get("direction"));
  if (itemId === null || direction === null) back(moduleId, "change-failed");

  const { data, error } = await supabase
    .from("curriculum_items")
    .select("id, sort_order")
    .eq("module_id", moduleId)
    .limit(2000);
  if (error) back(moduleId, "change-failed");

  // Sequential, as the programme builder does: see `planMove` for why a partial
  // write still leaves a valid order.
  const changes = planMove((data ?? []).map((row) => ({ id: row.id, sortOrder: row.sort_order })), itemId, direction);
  for (const change of changes) {
    const { data: updated, error: updateError } = await supabase
      .from("curriculum_items")
      .update({ sort_order: change.sortOrder })
      .eq("id", change.id)
      .select("id");
    if (updateError || (updated ?? []).length !== 1) back(moduleId, "change-failed");
  }
  back(moduleId, "moved");
}
