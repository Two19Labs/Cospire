"use server";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { planVideoProgress } from "../video";

// The player reports its position every few seconds. `item_progress_insert_own`
// and `_update_own` are the gate: the row must be the caller's, for a video item
// in a programme they hold. The length comes from `videos`, read through RLS,
// so the browser cannot claim a percent; it can only report a position.
export async function recordVideoProgressAction(itemId: number, positionSeconds: number): Promise<void> {
  const student = await requireRole("student");
  if (!Number.isSafeInteger(itemId) || itemId <= 0 || !Number.isFinite(positionSeconds)) return;

  const supabase = await createServerSupabaseClient();
  const { data: item } = await supabase
    .from("curriculum_items")
    .select("ref_id")
    .eq("id", itemId)
    .eq("type", "video")
    .maybeSingle();
  if (!item) return;

  const [{ data: video }, { data: existing }] = await Promise.all([
    supabase.from("videos").select("duration_seconds").eq("id", item.ref_id as number).maybeSingle(),
    supabase
      .from("item_progress")
      .select("percent, completed, completed_at")
      .eq("student_id", student.id)
      .eq("item_id", itemId)
      .maybeSingle(),
  ]);
  if (!video) return;

  const next = planVideoProgress(
    existing as { completed: boolean; percent: number } | null,
    positionSeconds,
    video.duration_seconds as number | null,
  );
  await supabase.from("item_progress").upsert(
    {
      completed: next.completed,
      // The first completion time is the one worth keeping.
      completed_at: next.completed ? ((existing?.completed_at as string | null) ?? new Date().toISOString()) : null,
      item_id: itemId,
      last_position: next.lastPosition,
      org_id: student.orgId,
      percent: next.percent,
      student_id: student.id,
    },
    { onConflict: "student_id,item_id" },
  );
}
