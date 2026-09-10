"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import { validateNewCourse } from "../course-input";
import { buildCourseHref, buildCoursesHref } from "../list-params";

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

  const { errors, value } = validateNewCourse({
    sortOrder: formData.get("sortOrder"),
    title: formData.get("title"),
  });

  if (!value) {
    // Mapped onto the closed error set rather than reflected back, so nothing
    // the admin typed is ever put into a URL and rendered.
    if (errors.title) {
      redirect(
        buildCoursesHref({
          error: errors.title.includes("at most")
            ? "title-too-long"
            : "title-missing",
          page: 1,
          search: "",
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
      buildCoursesHref({
        error: error.code === "23505" ? "duplicate-title" : "create-failed",
        page: 1,
        search: "",
      }),
    );
  }

  const courseId = (data as Record<string, unknown> | null)?.id;

  if (typeof courseId !== "number") {
    // The insert reported success but returned nothing to navigate to. Say so
    // rather than guessing at an id: the row may well exist, and the list is
    // where the admin will see it.
    redirect(buildCoursesHref({ error: "create-failed", page: 1, search: "" }));
  }

  revalidatePath("/admin/courses");

  // Straight to the detail page, because the only reason to create a programme
  // is to put students on it, and that control lives there.
  redirect(buildCourseHref({ courseId, notice: "created" }));
}
