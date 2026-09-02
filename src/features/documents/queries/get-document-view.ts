import "server-only";

import type { Profile } from "@/features/auth/types";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { documentsBucket, documentUrlTtlSeconds } from "../storage";
import { composeWatermark } from "../watermark";
import { getDocument, type DocumentRecord } from "./get-document";

export interface DocumentView {
  document: DocumentRecord;
  fileUrl: string;
  watermark: string;
}

// Two clients, doing two different jobs, and the order matters.
//
// `getDocument` runs as the signed-in user, so RLS decides whether they may see
// this document at all. Only after it has said yes does the secret-key client
// sign a URL. The secret key bypasses every policy in the database, so it is
// never allowed to answer the question "may they?" -- only to act on an answer
// the database already gave.
//
// The alternative, signing the URL with the user's own client, cannot work:
// `documents_objects_select_authorized` is evaluated against the object store,
// and there is no route through it that produces a signed URL. So the split is
// forced as well as correct.
export async function getDocumentView({
  documentId,
  viewer,
  viewedAt = new Date(),
}: {
  documentId: number;
  viewedAt?: Date;
  viewer: Profile;
}): Promise<DocumentView | null> {
  const document = await getDocument(documentId);
  if (!document) return null;

  const adminClient = createAdminSupabaseClient();
  const { data, error } = await adminClient.storage
    .from(documentsBucket)
    .createSignedUrl(document.storagePath, documentUrlTtlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Unable to prepare the document for viewing: ${
        error?.message ?? "no signed URL was returned."
      }`,
    );
  }

  return {
    document,
    fileUrl: data.signedUrl,
    // Composed here, from the session profile. Nothing the browser sends is
    // consulted. Technical brief §7.
    watermark: composeWatermark({
      subject: { email: viewer.email, name: viewer.name },
      viewedAt,
    }),
  };
}
