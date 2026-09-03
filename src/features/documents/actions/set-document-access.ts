"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { buildDocumentHref, parseDocumentId } from "../list-params";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phase 1 step 4: manual access granting, writing `content_access`.
//
// This is the middle sentence of the exit gate -- "granting them a document" --
// and it is a thin layer over rules the database already enforces.
// `content_access_insert_admin` decides who may grant, the
// `content_access_validate_roles` trigger refuses a target who is not an active
// student in the same organisation, and the `content_access_validate_resource`
// trigger added in this feature's migration refuses a document belonging to
// another organisation. None of those rules are restated here, because two
// copies of a rule is how the copies drift apart.
export async function setDocumentAccessAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawDocumentId = formData.get("documentId");
  const documentId = parseDocumentId(
    typeof rawDocumentId === "string" ? rawDocumentId : undefined,
  );

  if (documentId === null) {
    // Nowhere sensible to send them: without a valid document id there is no
    // detail page to return to.
    redirect("/admin/documents?error=invalid-request");
  }

  const studentId = formData.get("studentId");
  const intent = formData.get("intent");

  if (
    typeof studentId !== "string" ||
    !uuidPattern.test(studentId) ||
    (intent !== "grant" && intent !== "revoke")
  ) {
    redirect(buildDocumentHref({ documentId, error: "invalid-request" }));
  }

  const supabase = await createServerSupabaseClient();
  let failed = false;

  if (intent === "grant") {
    // A plain insert, not an upsert, and the difference is not cosmetic.
    //
    // `content_access` is granted only SELECT, INSERT and DELETE to
    // `authenticated`, and carries no UPDATE policy -- correct, because a grant
    // has nothing to update: every column is an identity, a foreign key or the
    // resource it names. An upsert compiles to INSERT ... ON CONFLICT DO
    // UPDATE, which needs UPDATE rights, so it is refused outright with 42501
    // and no row is ever written. Caught by the end-to-end verification run;
    // typecheck, lint and build all passed with the upsert in place.
    const { error } = await supabase.from("content_access").insert({
      granted_by: admin.id,
      org_id: admin.orgId,
      resource_id: documentId,
      resource_type: "document",
      student_id: studentId,
    });

    // 23505 is `content_access_grant_unique` firing: this student already has
    // this document. That is the state the admin asked for, so it is a success.
    failed = error !== null && error.code !== "23505";
  } else {
    // Counting the affected rows, not trusting the absence of an error.
    //
    // The Phase 1 audit found exactly this: when RLS filters a write to zero
    // rows, PostgREST returns no error at all, so an action that only checks
    // `error` reports success for a change that never happened. A revoke that
    // silently did nothing would leave an admin believing they had removed
    // access that is still live, which is the worst possible direction for this
    // particular mistake.
    const { data, error } = await supabase
      .from("content_access")
      .delete()
      .eq("student_id", studentId)
      .eq("resource_type", "document")
      .eq("resource_id", documentId)
      .select("id");

    // Zero rows is only acceptable when the grant genuinely was not there. That
    // is indistinguishable from a policy refusal at this layer, so both are
    // reported as a failure rather than quietly as success; re-checking the
    // list is what tells the admin which it was.
    failed = Boolean(error) || (data ?? []).length !== 1;
  }

  if (failed) {
    redirect(buildDocumentHref({ documentId, error: "access-change-failed" }));
  }

  revalidatePath(`/admin/documents/${documentId}`);
  redirect(
    buildDocumentHref({
      documentId,
      notice: intent === "grant" ? "granted" : "revoked",
    }),
  );
}
