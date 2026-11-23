"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/guards";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";
import { parseCourseId, type CourseKind } from "@/features/curriculum/list-params";

import { readStudentSheet } from "../bulk-students";
import type { BulkCreateStudentsState } from "./bulk-create-students-state";

// 100 rows of a name and an address is a few kilobytes; anything near this is
// the wrong file.
const maxSheetBytes = 256 * 1024;

// Invitations in flight at once. Each takes about 2.6 s, almost all of it the
// SMTP hand-off to Resend, which allows 2 sends a second. Two at a time keeps
// under that and sends 100 in a little over two minutes (`maxDuration` on the
// page allows five).
const inviteBatch = 2;

function failed(error: string): BulkCreateStudentsState {
  return { created: 0, error, problems: [] };
}

export async function bulkCreateStudentsAction(
  _previousState: BulkCreateStudentsState,
  formData: FormData,
): Promise<BulkCreateStudentsState> {
  // A Server Action is a public endpoint; the page guard does not protect it.
  const admin = await requireRole("admin");

  const file = formData.get("sheet");
  if (!(file instanceof File) || file.size === 0) {
    return failed("Choose the CSV file to upload.");
  }
  if (file.size > maxSheetBytes) {
    return failed(
      "That file is too large for a list of students. Save the sheet as CSV with just the name and email columns.",
    );
  }

  // Every row is checked before anything is created: one bad row creates
  // nothing (Technical Brief 5.3).
  const { problems, rows } = readStudentSheet(await file.text());
  if (problems.length > 0) return { created: 0, error: null, problems };

  // The optional End-to-End enrolment (D62): a programme, an ARS process, or
  // both, granted to every student on the sheet. Checked before any invitation
  // goes out: an id that is not a course of that kind in the admin's own
  // organisation (RLS hides any other) refuses the whole upload.
  const courses: { id: number; kind: CourseKind }[] = [];
  for (const [field, kind] of [["programmeId", "programme"], ["processId", "ars_process"]] as const) {
    const raw = formData.get(field);
    if (raw === null || raw === "") continue;
    const id = parseCourseId(typeof raw === "string" ? raw : undefined);
    if (id === null) return failed("That programme or ARS process was not valid. Nothing was created.");
    courses.push({ id, kind });
  }
  if (courses.length > 0) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, kind")
      .in("id", courses.map((course) => course.id));
    const kindOf = new Map((data ?? []).map((course) => [course.id, course.kind]));
    if (error || courses.some((course) => kindOf.get(course.id) !== course.kind)) {
      return failed("That programme or ARS process was not found. Nothing was created.");
    }
  }

  const createdIds: string[] = [];
  let failure: string | null = null;

  try {
    const adminClient = createAdminSupabaseClient();

    // An address that already has an account is a problem in the sheet, found
    // before any invitation goes out. Auth addresses are unique across the
    // whole project, so this checks every organisation, not only the admin's.
    const { data: listed, error: listError } =
      await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) {
      return failed(`Existing accounts could not be checked: ${listError.message}`);
    }
    const taken = new Set(listed.users.map((user) => user.email?.toLowerCase()));
    const clashes = rows
      .filter((row) => taken.has(row.email))
      .map((row) => ({ message: `${row.email} already has an account.`, row: row.row }));
    if (clashes.length > 0) return { created: 0, error: null, problems: clashes };

    // Two systems and no shared transaction, as in `create-user.ts`: the
    // identities are Auth API calls and the profiles one database statement.
    // "All or none" is therefore a compensating delete of every identity this
    // upload made, which takes its profile with it (`on delete cascade`).
    const idByEmail = new Map<string, string>();
    for (let i = 0; i < rows.length && !failure; i += inviteBatch) {
      const batch = rows.slice(i, i + inviteBatch);
      const results = await Promise.all(
        batch.map((row) =>
          adminClient.auth.admin.inviteUserByEmail(row.email, {
            data: { name: row.name },
          }),
        ),
      );
      results.forEach(({ data, error }, index) => {
        const row = batch[index];
        if (data.user) {
          createdIds.push(data.user.id);
          idByEmail.set(row.email, data.user.id);
        }
        if (error || !data.user) {
          failure ??= `Row ${row.row} (${row.email}) could not be invited: ${
            error?.message ?? "Supabase Auth returned no account."
          }`;
        }
      });
    }

    if (!failure) {
      // The signed-in admin's own client, so `profiles_insert_admin` decides
      // which organisation may be written into (see `create-user.ts`).
      const supabase = await createServerSupabaseClient();
      const { error: profileError } = await supabase.from("profiles").insert(
        rows.map((row) => ({
          email: row.email,
          id: idByEmail.get(row.email) as string,
          name: row.name,
          org_id: admin.orgId,
          role: "student" as const,
        })),
      );
      if (profileError) {
        failure = `The student profiles could not be saved: ${profileError.message}`;
      } else if (courses.length > 0) {
        // One statement for every grant, so a refusal writes none of them and
        // falls into the same undo as a failed invitation below.
        const { error: grantError } = await supabase.from("content_access").insert(
          rows.flatMap((row) =>
            courses.map((course) => ({
              granted_by: admin.id,
              org_id: admin.orgId,
              resource_id: course.id,
              resource_type: "course",
              student_id: idByEmail.get(row.email) as string,
            })),
          ),
        );
        if (grantError) {
          failure = `The programme and ARS access could not be granted: ${grantError.message}`;
        }
      }
    }
  } catch (cause) {
    failure =
      cause instanceof Error ? cause.message : "The students could not be created.";
  }

  if (failure) {
    const adminClient = createAdminSupabaseClient();
    const leftBehind: string[] = [];
    for (const id of createdIds) {
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) leftBehind.push(id);
    }
    const sent =
      createdIds.length > 0
        ? ` ${createdIds.length} invitation email${createdIds.length === 1 ? " had" : "s had"} already gone out; those links no longer work, and uploading the sheet again sends fresh ones.`
        : "";
    const orphaned =
      leftBehind.length > 0
        ? ` Undoing ${leftBehind.length} account${leftBehind.length === 1 ? "" : "s"} failed as well; delete them in the Supabase dashboard (Authentication) before retrying.`
        : "";
    const outcome = leftBehind.length > 0 ? "The upload was not completed." : "Nothing was created.";
    return failed(`${outcome} ${failure}${sent}${orphaned}`);
  }

  revalidatePath("/admin/users");
  return { created: rows.length, error: null, problems: [] };
}
