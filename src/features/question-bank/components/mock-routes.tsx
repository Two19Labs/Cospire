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
  const picker = await listPickerQuestions(parseMockPage(params.page));
  // Everything already in the mock that this page does not show, archived rows
  // included, so each one can be unticked here instead of being re-posted.
  const onPage = new Set(picker.rows.map((row) => row.id));
  const selected = await listSelectedQuestions(
    value.sections.flatMap((section) => section.questionIds).filter((id) => !onPage.has(id)),
  );
  return <MockEditor error={typeof params.error === "string" ? params.error : undefined} notice={typeof params.notice === "string" ? params.notice : undefined} offPage={selected} picker={picker} profile={profile} value={value}>{children}</MockEditor>;
}
