import "server-only";

import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import {
  documentsPageSize,
  sanitizeDocumentSearch,
  sanitizeFolderFilter,
} from "../list-params";

export interface DocumentListRow {
  createdAt: string;
  folder: string;
  id: number;
  title: string;
}

export interface DocumentListPage {
  page: number;
  pageCount: number;
  rows: DocumentListRow[];
  total: number;
}

function toRow(entry: unknown): DocumentListRow {
  const row = entry as Record<string, unknown>;

  if (
    typeof row.id !== "number" ||
    typeof row.title !== "string" ||
    typeof row.folder !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("A document row came back in an unexpected shape.");
  }

  return {
    createdAt: row.created_at,
    folder: row.folder,
    id: row.id,
    title: row.title,
  };
}

// No organisation filter and no role filter, for the same reason `listUsers`
// has none: `documents_select_authorized` already scopes an admin to their own
// organisation and a student to their grants. Restating that here would be
// application code impersonating the access control, and would mask the
// difference if the policy ever changed.
//
// This one query therefore serves both the admin library and a student's own
// list. The rows each sees differ entirely, and the difference is the database's
// decision, not this function's.
export async function listDocuments({
  folder,
  page,
  search,
}: {
  folder: string;
  page: number;
  search: string;
}): Promise<DocumentListPage> {
  const supabase = await createServerSupabaseClient();
  const term = sanitizeDocumentSearch(search);
  const folderFilter = sanitizeFolderFilter(folder);
  const from = (page - 1) * documentsPageSize;

  let query = supabase
    .from("documents")
    .select("id, title, folder, created_at", { count: "exact" })
    .order("folder", { ascending: true })
    .order("title", { ascending: true })
    // A unique final sort key. Two documents sharing a title would otherwise
    // come back in an arbitrary order and could swap between pages, showing one
    // twice and hiding another entirely.
    .order("id", { ascending: true })
    .range(from, from + documentsPageSize - 1);

  if (term) {
    query = query.ilike("title", `%${term}%`);
  }

  if (folderFilter) {
    query = query.eq("folder", folderFilter);
  }

  const { count, data, error } = await query;

  if (error) {
    throw new Error(`Unable to list documents: ${error.message}`);
  }

  const rows = (data ?? []).map(toRow);
  const total = count ?? rows.length;

  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / documentsPageSize)),
    rows,
    total,
  };
}

// The folder facet, for the filter control and the "existing folders" hint on
// the upload form.
//
// This is a facet rather than a listing, so it is capped instead of paginated:
// a dropdown showing five hundred folders is already a design failure, and the
// cap means a growing library degrades the hint rather than the page. If the
// library ever outgrows it, this becomes a grouped aggregate behind a database
// function, which is a migration rather than a rewrite.
const folderFacetLimit = 500;

export async function listFolders(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("documents")
    .select("folder")
    .order("folder", { ascending: true })
    .limit(folderFacetLimit);

  if (error) {
    throw new Error(`Unable to list folders: ${error.message}`);
  }

  const seen = new Set<string>();
  for (const entry of data ?? []) {
    const folder = (entry as Record<string, unknown>).folder;
    // Unfiled documents are a real state, but "" is not a folder anyone can
    // pick, so it never reaches the control.
    if (typeof folder === "string" && folder !== "") seen.add(folder);
  }

  return [...seen];
}
