// Validation for everything an admin types about a programme.
//
// The bounds here match the check constraints in
// `20260910115938_courses_and_course_grants.sql` exactly. The database is the
// enforcer; this exists so an admin gets a sentence they can act on instead of
// a constraint violation.
//
// "Programme" is the Client's word and the one the interface uses. "Course" is
// the schema's word. They are the same thing, and the split is deliberate:
// renaming the table would break every reference in the operating manual, and
// showing an admin the word "course" would not match how they were told the
// system works.

export interface NewCourseFieldErrors {
  sortOrder?: string;
  title?: string;
}

export interface NewCourseValue {
  sortOrder: number;
  title: string;
}

export interface NewCourseValidation {
  errors: NewCourseFieldErrors;
  value: NewCourseValue | null;
}

export const courseTitleMaxLength = 200;

// A signed 32-bit integer, matching the `integer` column. Anything outside it
// is refused here rather than sent to Postgres to fail as an overflow.
export const courseSortOrderMin = -2_147_483_648;
export const courseSortOrderMax = 2_147_483_647;

export function validateNewCourse(input: {
  sortOrder: unknown;
  title: unknown;
}): NewCourseValidation {
  const errors: NewCourseFieldErrors = {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    errors.title = "Give the programme a name.";
  } else if (title.length > courseTitleMaxLength) {
    errors.title = `Use at most ${courseTitleMaxLength} characters.`;
  }

  // Ordering is optional. Left blank it goes to 0, which puts a new programme
  // at the top of the list alongside every other unordered one, tie-broken by
  // id. That is a defensible default: the admin sees it immediately rather than
  // having to hunt for it at the bottom.
  let sortOrder = 0;
  const rawSortOrder =
    typeof input.sortOrder === "string" ? input.sortOrder.trim() : "";

  if (rawSortOrder !== "") {
    // Parsed strictly rather than with Number.parseInt, which reads "12abc" as
    // 12 and would silently accept a typo.
    if (!/^-?[0-9]{1,10}$/.test(rawSortOrder)) {
      errors.sortOrder = "Use a whole number.";
    } else {
      const parsed = Number(rawSortOrder);
      if (parsed < courseSortOrderMin || parsed > courseSortOrderMax) {
        errors.sortOrder = "That number is too large.";
      } else {
        sortOrder = parsed;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  return { errors, value: { sortOrder, title } };
}
