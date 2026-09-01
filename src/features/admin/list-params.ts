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
