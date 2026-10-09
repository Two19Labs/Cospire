import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export const pickerPageSize = 50;

export interface PickerOption {
  id: number;
  label: string;
}

export interface PickerPage {
  options: PickerOption[];
  page: number;
  pageCount: number;
}

// The documents and mocks an admin can place in a curriculum, a page at a time
// (manual §8: every list query is paginated). RLS scopes both to the admin's
// organisation.
export async function listPickerPage(
  kind: "documents" | "mocks",
  page: number,
): Promise<PickerPage> {
  const supabase = await createServerSupabaseClient();
  const from = (page - 1) * pickerPageSize;
  const range = [from, from + pickerPageSize - 1] as const;

  const { count, data, error } =
    kind === "documents"
      ? await supabase
          .from("documents")
          .select("id, title, folder", { count: "exact" })
          .order("folder")
          .order("title")
          .order("id")
          .range(...range)
      : await supabase
          .from("mocks")
          .select("id, title", { count: "exact" })
          .order("id", { ascending: false })
          .range(...range);

  if (error) throw new Error(`Unable to list ${kind}: ${error.message}`);

  return {
    options: (data ?? []).map((row: { folder?: string; id: number; title: string }) => ({
      id: row.id,
      label: row.folder ? `${row.folder} / ${row.title}` : row.title,
    })),
    page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / pickerPageSize)),
  };
}
