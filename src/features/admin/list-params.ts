// Pure request-parameter handling for the user list.
//
// Kept out of `queries/list-users.ts` deliberately: that module is `server-only`,
// which Next.js resolves through a bundler alias rather than a real package, so
// anything importing it is unreachable from a unit test. The filter-injection
// guard below is exactly the kind of code that must stay directly testable.

// Paginated from the first commit, per operating manual §8. `profiles` holds
// three rows today and is contracted to hold a hundred; a screen that loads the
// whole table is fine at both sizes and is a habit that dies badly in the
// question bank, where the same shortcut meets fifty thousand rows.
export const usersPageSize = 25;

// PostgREST reads `or=(...)` as a comma-separated list of filters, so a comma,
// parenthesis, backslash or double quote inside the term rewrites the filter
// rather than being matched by it. `%` is an ilike wildcard. None of the five
// mean anything inside a name or an email address, so they are dropped.
//
// `_` is also a wildcard and is deliberately kept: it appears in real addresses,
// and the worst it can do is widen the match, which is not a security property.
export function sanitizeUserSearch(raw: string): string {
  return raw
    .replace(/[,()\\"%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function parsePageNumber(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

// Every link and post-action redirect to the user list is built here, from
// parsed values only.
//
// This is what keeps the mentor-assignment form from being an open redirect.
// The obvious way to return an admin to the page they came from is a hidden
// field holding the URL, which hands an attacker a form that posts to our
// origin and bounces the browser anywhere they like. Carrying the page number
// and search term instead, and rebuilding the path from a literal here, makes
// the destination impossible to influence.
export function buildUsersHref({
  error,
  page,
  search,
}: {
  error?: UserListError;
  page: number;
  search: string;
}): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

// A closed set, so a crafted `?error=` value renders nothing at all rather than
// reaching the page. Same approach as the `?error=no_profile` handling added to
// the sign-in screen in Phase 0.
export const userListErrors = {
  "assignment-failed": "That mentor assignment was refused. Nothing changed.",
  "invalid-request": "That request was not valid. Nothing changed.",
  "last-admin":
    "That would leave the organisation with no active admin. Promote another " +
    "admin first. Nothing changed.",
  "status-change-failed": "That account could not be updated. Nothing changed.",
} as const;

export type UserListError = keyof typeof userListErrors;

export function parseUserListError(
  raw: string | undefined,
): UserListError | null {
  if (raw && Object.hasOwn(userListErrors, raw)) {
    return raw as UserListError;
  }
  return null;
}
