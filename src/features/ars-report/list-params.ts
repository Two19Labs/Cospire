// Pure request-parameter handling for the ARS report lists.
//
// Kept out of `queries/` for the same reason the ARS rounds feature keeps its
// own: those modules are `server-only`, which Next.js resolves through a bundler
// alias rather than a real package, so anything importing them is unreachable
// from a unit test. The parsing below is the part worth testing, so it lives
// where a test can reach it.

// Both lists are bounded from the first commit, per operating manual §8. The
// mentor queue reads every completed process a mentor can see and then fans that
// id list into four follow-up queries, so an unbounded page is not one slow
// screen -- it is four `IN` lists whose length nobody chose.
export const mentorReportsPageSize = 20;
export const studentReportsPageSize = 20;

// A page number arrives from the query string, so it is anything at all until
// proven otherwise. Anything that is not a positive whole number is page one
// rather than an error: a mistyped URL should show the first page, not a stack
// trace.
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^[0-9]{1,6}$/.test(value)) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

// Destinations are rebuilt from parsed values only, never from a supplied
// string. Same open-redirect reasoning as `buildRoundsHref` and the admin
// console's `buildUsersHref`.
export function buildReportsHref({ base, page }: { base: "/mentor" | "/student"; page: number }): string {
  const safePage = Number.isSafeInteger(page) && page > 1 ? page : 1;
  return safePage === 1 ? base : `${base}?page=${safePage}`;
}
