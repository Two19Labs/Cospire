import "server-only";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { DeleteTargetType } from "../targets";

export interface DeletePreview {
  id: number;
  label: string;
  type: DeleteTargetType;
  counts: Record<string, number>;
  // Set when something outside this feature would be left pointing at nothing:
  // an ARS round linked to the mock. The delete is refused until it is unlinked.
  blockedBy: string | null;
}

function toCounts(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const count = Number(value);
      if (Number.isFinite(count)) counts[key] = count;
    }
  }
  return counts;
}

// The counts the confirmation screen states. Measured by
// `public.content_delete_preview`, which is SECURITY DEFINER: a count filtered
// down by a missing read policy would understate what is about to be removed,
// and a confirmation screen that understates is worse than none.
export async function getDeletePreview(type: DeleteTargetType, id: number): Promise<DeletePreview | null> {
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("content_delete_preview", { p_id: id, p_type: type });
  // P0002 is "not in your organisation, or not there at all", which the screen
  // turns into a 404 rather than telling the caller which.
  if (error) {
    if (error.code === "P0002") return null;
    throw new Error(`Unable to read what deleting this would remove: ${error.message}`);
  }
  const row = data as { label?: unknown; counts?: unknown; blockedBy?: unknown } | null;
  if (!row || typeof row.label !== "string") return null;
  return {
    id,
    type,
    label: row.label,
    counts: toCounts(row.counts),
    blockedBy: typeof row.blockedBy === "string" && row.blockedBy.length > 0 ? row.blockedBy : null,
  };
}

export interface PendingCleanup {
  id: number;
  resourceType: "document" | "video";
  resourceLabel: string;
  lastError: string | null;
  createdAt: string;
}

// Deletes whose database half committed and whose file or VdoCipher video is
// still there. Shown to the admin with a way to run the second half again.
export async function listPendingCleanups(): Promise<PendingCleanup[]> {
  await requireRole("admin");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("deletion_cleanups")
    .select("id,resource_type,resource_label,last_error,created_at")
    .eq("status", "pending")
    .order("created_at")
    .limit(100);
  if (error) throw new Error(`Unable to list deletions needing attention: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    resourceType: row.resource_type === "video" ? "video" : "document",
    resourceLabel: row.resource_label,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));
}
