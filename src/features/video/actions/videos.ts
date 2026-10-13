"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { normaliseTitle, parsePositiveId } from "@/features/curriculum/curriculum";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { createUploadCredentials, fetchVideoInfo, isVdocipherId } from "../vdocipher";
import type { VideoMessage } from "../video";

function back(message: VideoMessage): never {
  revalidatePath("/admin/videos");
  redirect(`/admin/videos?notice=${message}`);
}

// Adds a video already in VdoCipher, by its id. Its length and status come
// from VdoCipher, never from the form; the title defaults to VdoCipher's.
// `videos_insert_admin` is the gate.
export async function addVideoAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");
  const raw = formData.get("vdocipherId");
  const vdocipherId = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!isVdocipherId(vdocipherId)) back("bad-id");

  let info;
  try {
    info = await fetchVideoInfo(vdocipherId);
  } catch {
    back("not-found");
  }

  const typed = formData.get("title");
  const title = normaliseTitle(typeof typed === "string" && typed.trim() ? typed : info.title);
  if (title === null) back("add-failed");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("videos").insert({
    created_by: admin.id,
    duration_seconds: info.durationSeconds,
    org_id: admin.orgId,
    status: info.status,
    title,
    vdocipher_id: vdocipherId,
  });
  back(error ? "add-failed" : "added");
}

// Re-reads length and status from VdoCipher, for a video still processing.
export async function refreshVideoAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const videoId = parsePositiveId(formData.get("videoId"));
  if (videoId === null) back("refresh-failed");

  const supabase = await createServerSupabaseClient();
  const { data: video } = await supabase
    .from("videos")
    .select("vdocipher_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) back("refresh-failed");

  let info;
  try {
    info = await fetchVideoInfo(video.vdocipher_id as string);
  } catch {
    back("refresh-failed");
  }

  // Counting rows: RLS filtering an update to nothing is not an error.
  const { data, error } = await supabase
    .from("videos")
    .update({ duration_seconds: info.durationSeconds, status: info.status })
    .eq("id", videoId)
    .select("id");
  back(error || (data ?? []).length !== 1 ? "refresh-failed" : "refreshed");
}

// Step one of an upload from the platform. VdoCipher issues a signed storage
// policy and a video id; the row is written now, as `pre_upload`, so a video
// whose upload is abandoned is visible rather than lost in VdoCipher. The
// browser then posts the file straight to VdoCipher's storage: no video byte
// passes through this server (manual §8). The policy is VdoCipher's own
// browser-upload design; it carries no API secret.
export async function startVideoUploadAction(
  rawTitle: string,
): Promise<{ clientPayload: Record<string, string> } | { error: string }> {
  const admin = await requireRole("admin");
  const title = normaliseTitle(rawTitle);
  if (title === null) return { error: "A title of up to 200 characters is required." };

  let credentials;
  try {
    credentials = await createUploadCredentials(title);
  } catch {
    return { error: "VdoCipher could not start the upload. Check the API secret and try again." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("videos").insert({
    created_by: admin.id,
    org_id: admin.orgId,
    status: "pre_upload",
    title,
    vdocipher_id: credentials.videoId,
  });
  if (error) return { error: "The video could not be added to the library." };

  revalidatePath("/admin/videos");
  return { clientPayload: credentials.clientPayload };
}
