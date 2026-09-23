// Pure request-parameter handling for the question bank.
//
// Kept out of `queries/` and `actions/` for the reason every feature here does
// it: those are `server-only`, which makes them unreachable from a unit test,
// and the injection guards below are exactly what must stay testable.

import { difficulties, questionTypes, type Difficulty, type QuestionType } from "./question-input";

export const questionsPageSize = 25;

// The two places the bank lives. Always chosen from the signed-in role, never
// from a form field or a URL, so no input can steer a redirect elsewhere.
export type QuestionBankBase = "/admin/questions" | "/mentor/questions";

export function questionBankBase(role: string): QuestionBankBase {
  return role === "admin" ? "/admin/questions" : "/mentor/questions";
}

// Same neutralisation as the document search: PostgREST reads commas,
// parentheses, backslashes and quotes inside a filter as filter syntax, and `%`
// is a wildcard.
export function sanitizeQuestionSearch(raw: string): string {
  return raw
    .replace(/[,()\\"%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// A topic filter is an equality match, but still input reaching a query: one
// that could never have been stored is never asked for.
export function sanitizeTopicFilter(raw: string): string {
  const topic = raw.replace(/\s+/g, " ").trim();
  return topic.length > 100 ? "" : topic;
}

export function parsePageNumber(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

// Every bigint id arriving from a URL or a form. Anything that is not a
// positive whole number is refused here rather than sent to Postgres.
export function parseId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[0-9]{1,18}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseQuestionType(raw: unknown): QuestionType | null {
  return questionTypes.find((type) => type === raw) ?? null;
}

export function parseDifficulty(raw: unknown): Difficulty | null {
  return difficulties.find((difficulty) => difficulty === raw) ?? null;
}

export interface QuestionFilters {
  archived: boolean;
  difficulty: Difficulty | null;
  page: number;
  search: string;
  sectionId: number | null;
  topic: string;
  type: QuestionType | null;
}

export function parseQuestionFilters(params: Record<string, string | undefined>): QuestionFilters {
  return {
    archived: params.status === "archived",
    difficulty: parseDifficulty(params.difficulty),
    page: parsePageNumber(params.page),
    search: sanitizeQuestionSearch(params.q ?? ""),
    sectionId: parseId(params.section),
    topic: sanitizeTopicFilter(params.topic ?? ""),
    type: parseQuestionType(params.type),
  };
}

export function buildQuestionsHref(
  base: QuestionBankBase,
  filters: Partial<QuestionFilters> & { notice?: QuestionNotice },
): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.sectionId) params.set("section", String(filters.sectionId));
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.type) params.set("type", filters.type);
  if (filters.archived) params.set("status", "archived");
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.notice) params.set("notice", filters.notice);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function buildQuestionHref(
  base: QuestionBankBase,
  questionId: number,
  notice?: QuestionNotice,
): string {
  return notice ? `${base}/${questionId}?notice=${notice}` : `${base}/${questionId}`;
}

export function buildNewQuestionHref(
  base: QuestionBankBase,
  type: QuestionType,
  parentId?: number | null,
): string {
  const params = new URLSearchParams({ type });
  if (parentId) params.set("parent", String(parentId));
  return `${base}/new?${params.toString()}`;
}

// Closed sets, so a crafted `?notice=` or `?error=` renders nothing at all.
export const questionNotices = {
  archived: "Question archived. It no longer appears in the bank or in new mocks.",
  restored: "Question restored to the bank.",
  saved: "Question saved.",
} as const;

export type QuestionNotice = keyof typeof questionNotices;

export function parseQuestionNotice(raw: string | undefined): QuestionNotice | null {
  return raw && Object.hasOwn(questionNotices, raw) ? (raw as QuestionNotice) : null;
}

export const sectionNotices = {
  created: "Section added.",
  deleted: "Section removed.",
  updated: "Section updated.",
} as const;

export const sectionErrors = {
  duplicate: "A section with that name already exists.",
  "in-use": "That section still holds questions. Move or archive them first.",
  invalid: "Give the section a name of at most 60 characters.",
  failed: "That change was refused. Nothing changed.",
} as const;

export type SectionNotice = keyof typeof sectionNotices;
export type SectionError = keyof typeof sectionErrors;

export function parseSectionNotice(raw: string | undefined): SectionNotice | null {
  return raw && Object.hasOwn(sectionNotices, raw) ? (raw as SectionNotice) : null;
}

export function parseSectionError(raw: string | undefined): SectionError | null {
  return raw && Object.hasOwn(sectionErrors, raw) ? (raw as SectionError) : null;
}

export function buildSectionsHref(state: { error?: SectionError; notice?: SectionNotice } = {}): string {
  if (state.error) return `/admin/questions/sections?error=${state.error}`;
  if (state.notice) return `/admin/questions/sections?notice=${state.notice}`;
  return "/admin/questions/sections";
}

export function normaliseSectionName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  return name !== "" && name.length <= 60 ? name : null;
}
