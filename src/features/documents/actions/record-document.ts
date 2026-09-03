"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { validateNewDocument } from "../document-input";
import { buildDocumentHref } from "../list-params";
import { documentsBucket, isDocumentStoragePath } from "../storage";
import type { UploadRejection } from "./upload-state";

// Step two of two: the object is already in the bucket, so record it.
//
// Object first, row second, deliberately.
//
// The other order -- row first, then upload -- leaves a library entry whose
// bytes never arrived, which is a document an admin can see, grant, and send a
// student to, that opens as a 404. This order can only ever leave an orphan
// object: invisible, costing a little storage, and cleanable. A user-visible
// broken document is worse than invisible garbage.
//
// The insert is therefore the commit point, and it does not happen until the
// object has been confirmed present.
export async function recordDocumentAction(input: {
  folder: string;
  path: string;
  title: string;
}): Promise<UploadRejection> {
  const admin = await requireRole("admin");

  const { errors, value } = validateNewDocument(input);
  if (!value) {
    return { error: null, fieldErrors: errors, ok: false };
  }

  // The browser supplies the path it was given in step one. Checked against the
  // admin's own organisation rather than trusted: without this, a hand-crafted
  // call could point a row at another organisation's object. The check
  // constraint in the migration refuses it as well -- this is the same rule
  // stated where it can produce a readable message.
  //
  // The type check is not redundant. A Server Action is a public endpoint, and
  // TypeScript's parameter types are erased at the boundary: a hand-crafted call
  // can send anything at all. Without this, a missing `path` reached
  // `String.prototype.split` and surfaced as a 500 from the error boundary,
  // which is a worse answer than a sentence saying what was wrong.
  if (
    typeof input.path !== "string" ||
    !isDocumentStoragePath({ orgId: admin.orgId, path: input.path })
  ) {
    return {
      error: "That upload could not be matched to this organisation.",
      fieldErrors: {},
      ok: false,
    };
  }

  let documentId: number | null = null;

  try {
    // Verified with the secret-key client, and it has to be.
    //
    // `documents_objects_select_authorized` grants read on an object only where
    // a `documents` row already names it -- and that row is what this action is
    // about to create. So at this instant nobody, not even the admin who just
    // uploaded it, can see the object through a policy. That is the access model
    // behaving correctly, and it is why this one check is privileged.
    const adminClient = createAdminSupabaseClient();
    const lastSlash = input.path.lastIndexOf("/");
    const directory = input.path.slice(0, lastSlash);
    const filename = input.path.slice(lastSlash + 1);

    const { data: found, error: listError } = await adminClient.storage
      .from(documentsBucket)
      .list(directory, { limit: 1, search: filename });

    if (listError) {
      return {
        error: `The uploaded file could not be confirmed: ${listError.message}`,
        fieldErrors: {},
        ok: false,
      };
    }

    const object = (found ?? []).find((entry) => entry.name === filename);
    const size =
      typeof object?.metadata?.size === "number" ? object.metadata.size : 0;

    if (!object || size <= 0) {
      return {
        error:
          "The file did not finish uploading, so nothing was added to the " +
          "library. Try again.",
        fieldErrors: {},
        ok: false,
      };
    }

    // Deliberately the signed-in admin's own client, not the secret-key one.
    // Confirming the object needed the secret key; this insert does not, and
    // routing it through the session keeps `documents_insert_admin` in charge of
    // which organisation may be written to. Using the secret key here would work
    // and would silently take RLS out of the path.
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        folder: value.folder,
        org_id: admin.orgId,
        storage_path: input.path,
        title: value.title,
        uploaded_by: admin.id,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        error: `The document could not be saved: ${
          error?.message ?? "the row was refused."
        }`,
        fieldErrors: {},
        ok: false,
      };
    }

    const row = data as Record<string, unknown>;
    if (typeof row.id !== "number") {
      throw new Error("The saved document came back without an id.");
    }

    documentId = row.id;
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? cause.message
          : "The document could not be saved.",
      fieldErrors: {},
      ok: false,
    };
  }

  revalidatePath("/admin/documents");
  // Outside the try, because redirect() signals success by throwing and
  // catching it would break the navigation.
  redirect(buildDocumentHref({ documentId, notice: "uploaded" }));
}
