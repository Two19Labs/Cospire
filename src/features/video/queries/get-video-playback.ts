import "server-only";

import type { Profile } from "@/features/auth/types";
import { composeWatermark } from "@/features/documents/watermark";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { requestOtp, type Playback, type VideoStatus } from "../vdocipher";

export interface VideoPlayback {
  // Null unless the video is ready: no OTP is requested for one that is not.
  playback: Playback | null;
  status: VideoStatus;
  title: string;
}

// The order is the access check, as in getDocumentView. The row is read as the
// signed-in user, so `videos_select_authorized` decides whether they may see it
// at all -- a direct grant, a programme holding it, or an admin of its
// organisation. Only after it returns the row is an OTP requested, so a student
// without access never causes a call to VdoCipher (operating manual §9.2).
export async function getVideoPlayback({
  videoId,
  viewer,
  viewedAt = new Date(),
}: {
  videoId: number;
  viewedAt?: Date;
  viewer: Profile;
}): Promise<VideoPlayback | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id, vdocipher_id, title, status")
    .eq("id", videoId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load the video: ${error.message}`);
  if (!data) return null;

  const row = data as { status: VideoStatus; title: string; vdocipher_id: string };
  if (row.status !== "ready") return { playback: null, status: row.status, title: row.title };

  // Composed from the session profile, never from anything the browser sends
  // (technical brief §7), in the same words as the document watermark.
  const watermark = composeWatermark({
    subject: { email: viewer.email, name: viewer.name },
    viewedAt,
  });
  return {
    playback: await requestOtp(row.vdocipher_id, watermark),
    status: row.status,
    title: row.title,
  };
}
