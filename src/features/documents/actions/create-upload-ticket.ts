"use server";

import { randomUUID } from "node:crypto";

import { requireRole } from "@/features/auth/guards";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";

import { validateNewDocument } from "../document-input";
import { buildDocumentStoragePath, documentsBucket } from "../storage";
import type { UploadTicketResult } from "./upload-state";

// Step one of two. Hands the browser a short-lived ticket to upload directly to
// Supabase Storage.
//
// The bytes never pass through this application. Operating manual §8 forbids it,
// and `CONTEXT.md` records the Vercel request payload limit as a High risk: a
// 40MB PDF posted to a Server Action would fail in production while working
// perfectly on a laptop, which is the worst kind of bug to ship.
//
// This is also the only screen in the product that requires JavaScript. Every
// other form still works with scripting disabled; a file cannot be, without
// routing the bytes through the server this action exists to avoid.
export async function createDocumentUploadTicketAction(input: {
  folder: string;
  title: string;
}): Promise<UploadTicketResult> {
  // Re-checked here rather than inherited from the page. A Server Action is a
  // public endpoint that any signed-in session can post to directly.
  const admin = await requireRole("admin");

  // Validated before the ticket is issued, so an admin with a bad title is told
  // now rather than after transferring fifty megabytes.
  const { errors, value } = validateNewDocument(input);
  if (!value) {
    return { error: null, fieldErrors: errors, ok: false };
  }

  const path = buildDocumentStoragePath({
    objectId: randomUUID(),
    orgId: admin.orgId,
  });

  try {
    // The secret-key client, because minting an upload URL is not something a
    // policy can express. What it may sign is still bounded: the path was built
    // from the admin's own `org_id`, read from their session profile, so it can
    // only ever address their own organisation's prefix.
    const adminClient = createAdminSupabaseClient();
    const { data, error } = await adminClient.storage
      .from(documentsBucket)
      .createSignedUploadUrl(path);

    if (error || !data?.token) {
      return {
        error: `The upload could not be started: ${
          error?.message ?? "no upload token was returned."
        }`,
        fieldErrors: {},
        ok: false,
      };
    }

    return { ok: true, path: data.path ?? path, token: data.token };
  } catch (cause) {
    // Most often the missing secret key. Surfacing it on the form beats the
    // generic error boundary, which hides the cause entirely.
    return {
      error:
        cause instanceof Error
          ? cause.message
          : "The upload could not be started.",
      fieldErrors: {},
      ok: false,
    };
  }
}
