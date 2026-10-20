import { requireRole } from "@/features/auth/guards";

import { parseMockPage } from "../mock-form";
import { getMock, listMocks, listPickerQuestions, listSelectedQuestions } from "../queries/mock-builder";
import { MockEditor } from "./mock-editor";
import { MocksScreen } from "./mocks-screen";

export async function MocksRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin");
  const page = parseMockPage((await searchParams).page);
  const mocks = await listMocks(page);
  return <MocksScreen mocks={mocks.rows} page={mocks.page} pageCount={mocks.pageCount} profile={profile} />;
}
export async function NewMockRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin"); const params = await searchParams;
  return <MockEditor error={typeof params.error === "string" ? params.error : undefined} picker={await listPickerQuestions(parseMockPage(params.page))} profile={profile} value={null} />;
}
export async function EditMockRoute({ children, mockId, searchParams }: { children?: React.ReactNode; mockId: number; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin"); const params = await searchParams;
  const value = await getMock(mockId);
  // The mock's own questions, in paper order, archived rows included so each can
  // be unticked here. The rest of the bank only on `?add=1` (owner, 2026-10-20):
  // a mock built from a paper should show that paper, not every question.
  const ids = value.sections.flatMap((section) => section.questionIds);
  const adding = params.add === "1";
  const [selected, picker] = await Promise.all([
    listSelectedQuestions(ids),
    adding ? listPickerQuestions(parseMockPage(params.page), ids) : Promise.resolve(null),
  ]);
  const inMock = [...selected].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return <MockEditor error={typeof params.error === "string" ? params.error : undefined} inMock={inMock} notice={typeof params.notice === "string" ? params.notice : undefined} picker={picker} profile={profile} value={value}>{children}</MockEditor>;
}
