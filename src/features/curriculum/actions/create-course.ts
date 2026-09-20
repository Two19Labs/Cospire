"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { validateNewCourse } from "../course-input";
import {
  buildCoursesHref,
  buildKindCourseHref,
  buildKindListHref,
  parseCourseKind,
} from "../list-params";

// Phase 5a step 1: an admin creates a programme.
//
// The Client asked explicitly not to be locked to a list we ship, so there is
// no seeded set of institutions anywhere in this feature. A programme is
// whatever an admin types.
//
// Written through the signed-in admin's own client, never the secret key, so
// `courses_insert_admin` still decides which organisation may be written to.
// Using the secret key here would work and would silently take RLS out of the
// path -- the same reasoning that governs `createUserAction`.
export async function createCourseAction(formData: FormData): Promise<void> {
  const admin = await requireRole("admin");

  // Which section the form was posted from, and therefore what is being
  // created. A closed set mapped to a literal path: the form may say which of
  // two sections it belongs to and nothing more, so this cannot become a
  // redirect a form field chose. Anything unrecognised is a programme, which is
  // what every caller was creating before the column existed.
  const kind = parseCourseKind(formData.get("kind")) ?? "programme";

  const { errors, value } = validateNewCourse({
    sortOrder: formData.get("sortOrder"),
    title: formData.get("title"),
  });

  if (!value) {
    // Mapped onto the closed error set rather than reflected back, so nothing
    // the admin typed is ever put into a URL and rendered.
    if (errors.title) {
      redirect(
        buildKindListHref({
          error: errors.title.includes("at most")
            ? "title-too-long"
            : "title-missing",
          kind,
        }),
      );
    }

    // No longer reachable through the form, which stopped offering an ordering
    // field on 2026-09-10: an absent field arrives as null, validates to 0, and
    // never lands here. The guard stays because a Server Action is an HTTP
    // endpoint, and a hand-posted `sortOrder` must still be refused rather than
    // reaching the integer column as whatever the caller typed.
    redirect(
      buildCoursesHref({ error: "sort-order-invalid", page: 1, search: "" }),
    );
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("courses")
    .insert({
      // Without this the row takes the column default and every process
      // created from the ARS screen is filed as a programme -- which is the
      // exact conflation the column exists to end. The redirect read `kind`
      // correctly while the insert did not, so the admin landed in ARS looking
      // at a row that was not there.
      kind,
      org_id: admin.orgId,
      sort_order: value.sortOrder,
      title: value.title,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 is `courses_title_unique_per_org` firing. That is a sentence the
    // admin can act on -- rename it, or find the one already there -- rather
    // than a generic failure, so it is separated out.
    redirect(
      buildKindListHref({
        error: error.code === "23505" ? "duplicate-title" : "create-failed",
        kind,
      }),
    );
  }

  const courseId = (data as Record<string, unknown> | null)?.id;

  if (typeof courseId !== "number") {
    // The insert reported success but returned nothing to navigate to. Say so
    // rather than guessing at an id: the row may well exist, and the list is
    // where the admin will see it.
    redirect(buildKindListHref({ error: "create-failed", kind }));
  }

  revalidatePath("/admin/courses");
  revalidatePath("/admin/ars");

  // Straight to the detail page, because the only reason to create either of
  // these is to put students on it, and that control lives there.
  redirect(buildKindCourseHref({ courseId, kind, notice: "created" }));
}
