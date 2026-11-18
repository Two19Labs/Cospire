import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AttemptAnalyticsBody } from "@/features/analytics/components/screens";
import { getAttemptAnalytics } from "@/features/analytics/queries/views";
import { requireRole } from "@/features/auth/guards";
import { parseId } from "@/features/question-bank/list-params";
import { StudentMockScreen } from "@/features/test-engine/components/student-mock-screens";
import { isPhone } from "@/features/test-engine/device";
import { courseForPlainStart, getStudentMock } from "@/features/test-engine/queries/student-mocks";

export default async function StudentMockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireRole("student");
  const mockId = parseId((await params).id);
  if (mockId === null) notFound();
  // Opened from a programme: its attempts and results are that programme's.
  const course = (await searchParams).course;
  let courseId = parseId(typeof course === "string" ? course : undefined);
  // Plain page: the programme a plain start would use, so results taken
  // through the one programme that holds the mock show up here.
  if (courseId === null) {
    const resolved = await courseForPlainStart(profile.id, mockId);
    if (resolved.kind === "ok") courseId = resolved.courseId;
  }
  // Null when the student holds no grant: RLS hides the mock entirely.
  const mock = await getStudentMock(mockId, courseId);
  if (!mock) notFound();
  const phone = isPhone((await headers()).get("user-agent"));
  // Once sat, the mock's page carries the latest result's analytics (owner,
  // 2026-10-19). Attempts are newest first; null while it awaits its score.
  const latest = mock.attempts.find((attempt) => attempt.status === "submitted");
  const analytics = latest ? await getAttemptAnalytics(latest.id, "student") : null;
  return (
    <StudentMockScreen
      analytics={analytics ? <AttemptAnalyticsBody data={analytics} /> : null}
      courseId={courseId}
      mock={mock}
      phone={phone}
      profile={profile}
    />
  );
}
