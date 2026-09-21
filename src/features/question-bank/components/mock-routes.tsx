import { requireRole } from "@/features/auth/guards";

import { parseMockPage } from "../mock-form";
import { getMock, listMocks, listPickerQuestions } from "../queries/mock-builder";
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
export async function EditMockRoute({ mockId, searchParams }: { mockId: number; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireRole("admin"); const params = await searchParams;
  return <MockEditor error={typeof params.error === "string" ? params.error : undefined} notice={typeof params.notice === "string" ? params.notice : undefined} picker={await listPickerQuestions(parseMockPage(params.page))} profile={profile} value={await getMock(mockId)} />;
}
