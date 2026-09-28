import { notFound } from "next/navigation";

import { requireRole } from "@/features/auth/guards";
import type { AppRole } from "@/features/auth/types";
import { parseId, parsePageNumber } from "@/features/question-bank/list-params";

import {
  getAttemptAnalytics,
  getMockAnalytics,
  getStudentForAdmin,
  getStudentOverview,
  listMentorAttempts,
  listMocksForAnalytics,
  listStudentsForAnalytics,
} from "../queries/views";
import {
  AdminAnalyticsHome,
  AttemptAnalyticsScreen,
  MentorAnalyticsScreen,
  MockAnalyticsScreen,
  StudentOverviewScreen,
} from "./screens";

// The route bodies. Each `page.tsx` under src/app is a one-line shell over one
// of these, so the role guard, the parsing and the not-found rule live beside
// the screens they serve.

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const backFor: Record<AppRole, { href: string; label: string }> = {
  admin: { href: "/admin/analytics", label: "All analytics" },
  mentor: { href: "/mentor/analytics", label: "All student results" },
  student: { href: "/student/analytics", label: "My analytics" },
};

async function attemptRoute(role: AppRole, params: Params) {
  const profile = await requireRole(role);
  const attemptId = parseId((await params).id);
  if (attemptId === null) notFound();
  // Null for anyone whose own session is not shown the attempt.
  const data = await getAttemptAnalytics(attemptId, role);
  if (!data) notFound();
  return <AttemptAnalyticsScreen back={backFor[role]} data={data} profile={profile} />;
}

export const StudentAttemptAnalyticsRoute = ({ params }: { params: Params }) => attemptRoute("student", params);
export const AdminAttemptAnalyticsRoute = ({ params }: { params: Params }) => attemptRoute("admin", params);
export const MentorAttemptAnalyticsRoute = ({ params }: { params: Params }) => attemptRoute("mentor", params);

export async function StudentAnalyticsRoute() {
  const profile = await requireRole("student");
  return (
    <StudentOverviewScreen
      attemptHref={(id) => `/student/analytics/attempts/${id}`}
      heading="Across your mocks"
      overview={await getStudentOverview()}
      profile={profile}
      title="My analytics"
    />
  );
}

export async function AdminAnalyticsRoute({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole("admin");
  const query = await searchParams;
  const mockPage = parsePageNumber(first(query.mocks));
  const studentPage = parsePageNumber(first(query.students));
  const [mocks, students] = await Promise.all([listMocksForAnalytics(mockPage), listStudentsForAnalytics(studentPage)]);
  return <AdminAnalyticsHome mockPage={mockPage} mocks={mocks} profile={profile} studentPage={studentPage} students={students} />;
}

export async function AdminMockAnalyticsRoute({ params }: { params: Params }) {
  const profile = await requireRole("admin");
  const mockId = parseId((await params).id);
  if (mockId === null) notFound();
  const data = await getMockAnalytics(mockId);
  if (!data) notFound();
  return <MockAnalyticsScreen data={data} profile={profile} />;
}

export async function AdminStudentAnalyticsRoute({ params }: { params: Params }) {
  const profile = await requireRole("admin");
  const studentId = (await params).id;
  if (!uuidPattern.test(studentId)) notFound();
  const data = await getStudentForAdmin(studentId);
  if (!data) notFound();
  return (
    <StudentOverviewScreen
      attemptHref={(id) => `/admin/analytics/attempts/${id}`}
      heading="Across their mocks"
      overview={data.overview}
      profile={profile}
      title={data.name}
    />
  );
}

export async function MentorAnalyticsRoute({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole("mentor");
  const page = parsePageNumber(first((await searchParams).page));
  const { rows, total } = await listMentorAttempts(page);
  return <MentorAnalyticsScreen page={page} profile={profile} rows={rows} total={total} />;
}
