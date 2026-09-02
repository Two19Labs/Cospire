import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

export interface DocumentRecord {
  createdAt: string;
  folder: string;
  id: number;
  orgId: number;
  storagePath: string;
  title: string;
  uploadedBy: string;
}

// Read through the caller's own session client, never the secret-key client.
//
// This is the whole access check for a single document, and it is deliberately
// not an `if` statement. `documents_select_authorized` returns the row to an
// admin of the owning organisation or to a student holding a content_access
// grant, and returns nothing to anybody else. A null here means "not yours",
// and the caller turns that into a 404 without ever having to know why.
export async function getDocument(id: number): Promise<DocumentRecord | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("documents")
    .select("id, org_id, title, folder, storage_path, uploaded_by, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load the document: ${error.message}`);
  }

  if (!data) return null;

  const row = data as Record<string, unknown>;

  if (
    typeof row.id !== "number" ||
    typeof row.org_id !== "number" ||
    typeof row.title !== "string" ||
    typeof row.folder !== "string" ||
    typeof row.storage_path !== "string" ||
    typeof row.uploaded_by !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("A document row came back in an unexpected shape.");
  }

  return {
    createdAt: row.created_at,
    folder: row.folder,
    id: row.id,
    orgId: row.org_id,
    storagePath: row.storage_path,
    title: row.title,
    uploadedBy: row.uploaded_by,
  };
}
