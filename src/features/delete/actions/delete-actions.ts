"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { deleteVideo } from "@/features/video/vdocipher";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { getDeletePreview } from "../queries/delete-preview";
import { collapseName, deleteTargets, parseDeleteTargetType, type DeleteTargetType } from "../targets";

function parseId(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function fail(type: DeleteTargetType, id: number, code: string): never {
  redirect(`/admin/delete/${type}/${id}?error=${code}`);
}

// Removes what the database cannot: the storage object, or the video in
// VdoCipher. Returns the message to record if it failed, or null if it is gone.
async function runExternalStep(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  resourceType: string,
  target: string,
): Promise<string | null> {
  try {
    if (resourceType === "video") {
      await deleteVideo(target);
      return null;
    }
    // The admin's own session: `documents_objects_delete_admin` already lets an
    // admin remove an object under their organisation's prefix, so the secret
    // key is not needed and never appears here (manual §9.1).
    const { error } = await supabase.storage.from("documents").remove([target]);
    // `remove` answers 200 with an empty list for a path that is not there, so
    // a missing object is treated as done rather than retried for ever.
    return error ? error.message : null;
  } catch (cause) {
    return cause instanceof Error ? cause.message : "The external delete failed.";
  }
}

async function closeCleanup(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  cleanupId: number,
  failure: string | null,
): Promise<void> {
  await supabase
    .from("deletion_cleanups")
    .update(failure === null ? { last_error: null, status: "done" } : { last_error: failure.slice(0, 1000) })
    .eq("id", cleanupId);
}

// Step three of three (D54): the Delete button, the confirmation screen with
// real counts, and this -- the typed name.
//
// The name is checked here **and** in `public.delete_content`, so a post that
// never rendered the confirmation screen is refused by the database as well.
export async function deleteContentAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const type = parseDeleteTargetType(formData.get("type"));
  const id = parseId(formData.get("id"));
  if (type === null || id === null) redirect("/admin");

  const typed = collapseName(formData.get("confirmName"));
  const preview = await getDeletePreview(type, id);
  if (!preview) fail(type, id, "missing");
  if (preview.blockedBy !== null) fail(type, id, "linked");
  if (typed !== collapseName(preview.label)) fail(type, id, "name");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("delete_content", {
    p_confirm_name: typed,
    p_id: id,
    p_type: type,
  });
  if (error) {
    fail(type, id, error.code === "23503" ? "linked" : error.code === "22023" ? "name" : error.code === "P0002" ? "missing" : "failed");
  }

  const result = data as { cleanupId?: number | null; target?: string | null } | null;
  const cleanupId = typeof result?.cleanupId === "number" ? result.cleanupId : null;
  const target = typeof result?.target === "string" ? result.target : null;

  revalidatePath(deleteTargets[type].listHref);
  revalidatePath("/admin/delete");

  if (cleanupId !== null && target !== null) {
    const failure = await runExternalStep(supabase, type, target);
    await closeCleanup(supabase, cleanupId, failure);
    // Never silently leave the file: the admin is taken to the one screen that
    // says so and can run it again.
    if (failure !== null) redirect("/admin/delete?error=cleanup");
  }

  redirect(`${deleteTargets[type].listHref}?notice=deleted`);
}

// The second half of a delete, run again. The database half is already done, so
// this only ever removes a file or a VdoCipher video.
export async function retryCleanupAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const cleanupId = parseId(formData.get("cleanupId"));
  if (cleanupId === null) redirect("/admin/delete");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("deletion_cleanups")
    .select("id,resource_type,target,status")
    .eq("id", cleanupId)
    .maybeSingle();
  if (error || !data || data.status !== "pending") redirect("/admin/delete?error=cleanup-gone");

  const failure = await runExternalStep(supabase, data.resource_type, data.target);
  await closeCleanup(supabase, cleanupId, failure);
  revalidatePath("/admin/delete");
  redirect(failure === null ? "/admin/delete?notice=cleaned" : "/admin/delete?error=cleanup");
}
