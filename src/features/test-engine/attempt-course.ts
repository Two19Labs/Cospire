// Which programme an attempt started from the plain mock page belongs to
// (shared modules, decision 2). A direct grant of the mock means outside any
// programme (null); otherwise the one programme the student holds that contains
// it; with several, or none, the student must start it from a programme page.
export type AttemptCourse = { courseId: number | null; kind: "ok" } | { kind: "choose" | "none" };

export function resolveAttemptCourse(directGrant: boolean, programmeIds: number[]): AttemptCourse {
  if (directGrant) return { courseId: null, kind: "ok" };
  const distinct = [...new Set(programmeIds)];
  if (distinct.length === 1) return { courseId: distinct[0]!, kind: "ok" };
  return { kind: distinct.length === 0 ? "none" : "choose" };
}

// The mock page for a mock in a list, opened in the programme of the latest
// attempt (newest first) so its result, count and Resume are that programme's.
export function mockPageHref(mockId: number, attempts: { courseId: number | null; status: string }[]): string {
  const courseId = attemptsCourse(attempts);
  return `/student/mocks/${mockId}${courseId ? `?course=${courseId}` : ""}`;
}

// The programme bucket of the latest attempt (newest first); null outside any.
export function attemptsCourse(attempts: { courseId: number | null }[]): number | null {
  return attempts[0]?.courseId ?? null;
}

// Attempts in one programme bucket, as the database guard counts them against
// `max_attempts`.
export function attemptsIn<T extends { courseId: number | null }>(attempts: T[], courseId: number | null): T[] {
  return attempts.filter((attempt) => attempt.courseId === courseId);
}
