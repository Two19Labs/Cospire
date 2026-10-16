import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { VideoStatus } from "../vdocipher";
import { videosPageSize } from "../video";

export interface VideoRow {
  createdAt: string;
  durationSeconds: number | null;
  id: number;
  status: VideoStatus;
  title: string;
  vdocipherId: string;
}

export interface VideoPage {
  page: number;
  pageCount: number;
  rows: VideoRow[];
  total: number;
}

// Newest first, a page at a time (manual §8). No organisation filter:
// `videos_select_authorized` scopes an admin to their own organisation.
export async function listVideos(page: number): Promise<VideoPage> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * videosPageSize;
  const { count, data, error } = await supabase
    .from("videos")
    .select("id, vdocipher_id, title, duration_seconds, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + videosPageSize - 1);
  if (error) throw new Error(`Unable to list videos: ${error.message}`);

  const total = count ?? 0;
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / videosPageSize)),
    rows: (data ?? []).map((row) => ({
      createdAt: row.created_at as string,
      durationSeconds: row.duration_seconds as number | null,
      id: row.id as number,
      status: row.status as VideoStatus,
      title: row.title as string,
      vdocipherId: row.vdocipher_id as string,
    })),
    total,
  };
}
