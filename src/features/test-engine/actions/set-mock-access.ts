"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Granting a student a mock. The same shape as programme granting, and for the
// same reasons: the database decides who may grant, refuses a non-student or
// another organisation's student, and (since 4.1) refuses a mock that does not
// exist or belongs to another organisation. None of it is restated here.
export async function setMockAccessAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  const rawMockId = formData.get("mockId");
  const mockId = parseId(typeof rawMockId === "string" ? rawMockId : undefined);
  if (mockId === null) redirect("/admin/mocks");

  const studentId = formData.get("studentId");
  const intent = formData.get("intent");
  const back = `/admin/mocks/${mockId}`;

  if (typeof studentId !== "string" || !uuidPattern.test(studentId) || (intent !== "grant" && intent !== "revoke")) {
    redirect(`${back}?access=failed`);
  }

  const supabase = await createServerSupabaseClient();
  let failed: boolean;

  if (intent === "grant") {
    // A plain insert: content_access has no UPDATE policy, so an upsert is
    // refused and writes nothing (see set-course-access.ts).
    const { error } = await supabase.from("content_access").insert({
      granted_by: admin.id,
      org_id: admin.orgId,
      resource_id: mockId,
      resource_type: "mock",
      student_id: studentId,
    });
    // 23505: already granted, which is the state asked for.
    failed = error !== null && error.code !== "23505";
  } else {
    // Counted, because RLS filtering a delete to zero rows is not an error.
    const { data, error } = await supabase
      .from("content_access")
      .delete()
      .eq("student_id", studentId)
      .eq("resource_type", "mock")
      .eq("resource_id", mockId)
      .select("id");
    failed = Boolean(error) || (data ?? []).length !== 1;
  }

  if (failed) redirect(`${back}?access=failed`);

  revalidatePath(back);
  redirect(`${back}?access=${intent === "grant" ? "granted" : "revoked"}`);
}
