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

// The mock page for a mock in a list: with a running attempt that belongs to a
// programme, opened in that programme so the attempt shows as Resume.
export function mockPageHref(mockId: number, attempts: { courseId: number | null; status: string }[]): string {
  const open = attempts.find((attempt) => attempt.status === "in_progress");
  return `/student/mocks/${mockId}${open?.courseId ? `?course=${open.courseId}` : ""}`;
}
