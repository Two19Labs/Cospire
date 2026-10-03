import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAnswered } from "@/features/test-engine/answer";
import type { PaperSection } from "@/features/test-engine/paper";
import { effectiveMarks } from "@/features/test-engine/scoring";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { PaperQuestion, ResponseFact } from "../aggregate";
import { layOutPaper, type QuestionTags } from "../paper-layout";

// How analytics reads, and why there is no migration behind it.
//
// Aggregates are computed here in TypeScript over bounded, indexed reads rather
// than in a SQL function. At clause 3.1's scale -- 100 students, a mock of about
// a hundred questions, a few attempts each -- one mock's responses are at most
// tens of thousands of small rows, read in pages of 1,000 by indexed columns
// (`attempts_mock_idx`, `attempts_student_idx`, `attempt_responses_attempt_idx`).
// A SQL function would need a migration applied by hand before any screen
// worked, for no difference a user could measure.
//
// **Who may see which attempts is decided by RLS alone.** Attempts and
// responses -- the student data -- are always read through the signed-in
// user's own session: `attempts_select_own`, `attempts_select_admin` and
// `attempts_select_mentor` return exactly what that person may see, and nothing
// below filters by role or organisation.
//
// The paper is different. Knowing that question 12 was "QA / Algebra / hard, 3
// marks" needs `mock_questions`, `questions` and `question_sections`, and two
// roles cannot read all three: a student has no read on `question_sections`,
// and a mentor none on `mocks` or `mock_questions`. For those two roles the
// paper's structure and tags -- never a body, an option, a key or anyone's
// answer -- are read with the server key, and **only for mocks named by
// attempts their own session has already returned**. That is the same pattern
// the test engine uses to sign question images. An admin's session can read the
// whole paper, so an admin's paper is read through it.


export interface AttemptRow {
  id: number;
  mockId: number;
  proctored: boolean;
  score: number | null;
  studentId: string;
  submittedAt: string;
  submittedBy: string | null;
}

export interface Paper {
  mockId: number;
  // Answerable questions only, in paper order: a DI passage carries no marks
  // and no answer; its sub-questions do.
  questions: PaperQuestion[];
  title: string;
}

const pageSize = 1000;
// A ceiling on any one read. Reaching it is an error, never a silent subset:
// a screen that showed part of the data as though it were all of it would be
// worse than one that said it could not load.
const rowCeiling = 50_000;
// Ids per `.in()` filter, to keep request URLs short.
const idChunk = 150;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    if (from >= rowCeiling) throw new Error(`Analytics refused to read more than ${rowCeiling} rows at once.`);
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to read analytics: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += idChunk) out.push(values.slice(index, index + idChunk));
  return out;
}

// Every chunk of `ids` read at once, results concatenated.
async function readChunks<T, I>(ids: I[], read: (group: I[]) => Promise<T[]>): Promise<T[]> {
  return (await Promise.all(chunks(ids).map(read))).flat();
}

export function groupBy<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

// The client that reads the paper for this role; see the note at the top.
export async function paperClient(role: "admin" | "mentor" | "student"): Promise<SupabaseClient> {
  return role === "admin" ? createServerSupabaseClient() : createAdminSupabaseClient();
}

export const attemptColumns = "id, mock_id, student_id, proctored, score, submitted_at, submitted_by";

interface AttemptRecord {
  id: number;
  mock_id: number;
  proctored: boolean;
  score: number | string | null;
  student_id: string;
  submitted_at: string;
  submitted_by: string | null;
}

export function toAttempt(row: AttemptRecord): AttemptRow {
  return {
    id: row.id,
    mockId: row.mock_id,
    proctored: row.proctored,
    score: row.score === null ? null : Number(row.score),
    studentId: row.student_id,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
  };
}

async function checked<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Unable to read ${what}: ${error.message}`);
  return data ?? [];
}

interface QuestionRecord {
  difficulty: string;
  id: number;
  marks: number | string;
  parent_id: number | null;
  section_id: number;
  topic: string;
  type: string;
}

// Every mock's answerable questions with their four tags, in paper order and
// numbered as the attempt screen numbers them, and its title.
export async function readPapers(db: SupabaseClient, mockIds: number[]): Promise<Map<number, Paper>> {
  const ids = [...new Set(mockIds)];
  const papers = new Map<number, Paper>();
  if (!ids.length) return papers;

  type SectionRecord = { duration_minutes: number | null; id: number; marks: number | null; mock_id: number; sort_order: number; title: string };
  type PlacedRecord = { mock_id: number; mock_section_id: number; question_id: number; sort_order: number };
  const [mocks, sections, placed] = await Promise.all([
    readChunks(ids, (group) => checked<{ id: number; title: string }>(db.from("mocks").select("id, title").in("id", group), "mocks")),
    readChunks(ids, (group) =>
      readAll<SectionRecord>((from, to) =>
        db.from("mock_sections").select("id, mock_id, title, duration_minutes, sort_order, marks").in("mock_id", group).order("id").range(from, to),
      ),
    ),
    readChunks(ids, (group) =>
      readAll<PlacedRecord>((from, to) =>
        db
          .from("mock_questions")
          .select("mock_id, mock_section_id, question_id, sort_order")
          .in("mock_id", group)
          .order("mock_id")
          .order("question_id")
          .range(from, to),
      ),
    ),
  ]);

  // Placed questions and, for each, every sub-question: archived or not, as the
  // engine scores and shows them.
  const columns = "id, parent_id, type, section_id, topic, difficulty, marks";
  const topIds = [...new Set(placed.map((row) => row.question_id))];
  const [top, children] = await Promise.all([
    readChunks(topIds, (group) => readAll<QuestionRecord>((from, to) => db.from("questions").select(columns).in("id", group).order("id").range(from, to))),
    readChunks(topIds, (group) =>
      readAll<QuestionRecord>((from, to) => db.from("questions").select(columns).in("parent_id", group).order("id").range(from, to)),
    ),
  ]);
  const records = new Map([...top, ...children].map((row) => [row.id, row]));

  const sectionIds = [...new Set([...records.values()].map((row) => row.section_id))];
  const sectionNames = new Map(
    (
      await readChunks(sectionIds, (group) =>
        checked<{ id: number; name: string }>(db.from("question_sections").select("id, name").in("id", group), "sections"),
      )
    ).map((row) => [row.id, row.name]),
  );

  const tags = new Map<number, QuestionTags>(
    [...records.values()].map((row) => [
      row.id,
      {
        difficulty: row.difficulty,
        id: row.id,
        marks: Number(row.marks),
        parentId: row.parent_id,
        section: sectionNames.get(row.section_id) ?? "Unnamed section",
        topic: row.topic,
        type: row.type,
      },
    ]),
  );
  const childrenOf = new Map([...groupBy(children, (row) => row.parent_id)].map(([parent, rows]) => [parent ?? 0, rows.map((row) => row.id)]));
  const sectionsByMock = groupBy(sections, (row) => row.mock_id);
  const placedByMock = groupBy(placed, (row) => row.mock_id);

  for (const mock of mocks) {
    const paperSections: PaperSection[] = (sectionsByMock.get(mock.id) ?? []).map((row) => ({
      durationMinutes: row.duration_minutes,
      id: row.id,
      sortOrder: row.sort_order,
      title: row.title,
    }));
    const placements = (placedByMock.get(mock.id) ?? []).map((row) => ({
      questionId: row.question_id,
      sectionId: row.mock_section_id,
      sortOrder: row.sort_order,
    }));
    // A question shared between mocks can earn different marks in each (D19),
    // so its tags are copied per mock with the marks this mock gives it.
    const marksBySection = new Map((sectionsByMock.get(mock.id) ?? []).map((row) => [row.id, row.marks === null ? null : Number(row.marks)]));
    const mockTags = new Map(tags);
    for (const row of placedByMock.get(mock.id) ?? []) {
      const tag = tags.get(row.question_id);
      if (tag) mockTags.set(row.question_id, { ...tag, marks: effectiveMarks(tag, marksBySection.get(row.mock_section_id)) });
    }
    papers.set(mock.id, { mockId: mock.id, questions: layOutPaper(paperSections, placements, mockTags, childrenOf), title: mock.title });
  }
  return papers;
}

// Each attempt's responses, keyed by question. Read through the caller's own
// session, so RLS decides whose answers come back.
export async function readResponses(db: SupabaseClient, attemptIds: number[]): Promise<Map<number, Map<number, ResponseFact>>> {
  const out = new Map<number, Map<number, ResponseFact>>(attemptIds.map((id) => [id, new Map()]));
  interface ResponseRecord {
    answer: unknown;
    attempt_id: number;
    is_correct: boolean | null;
    marks_awarded: number | string | null;
    question_id: number;
  }
  const rows = await readChunks(attemptIds, (group) =>
    readAll<ResponseRecord>((from, to) =>
      db
        .from("attempt_responses")
        .select("attempt_id, question_id, answer, is_correct, marks_awarded")
        .in("attempt_id", group)
        .order("attempt_id")
        .order("question_id")
        .range(from, to),
    ),
  );
  for (const row of rows) {
    out.get(row.attempt_id)?.set(row.question_id, {
      answered: isAnswered(row.answer),
      isCorrect: row.is_correct,
      marksAwarded: row.marks_awarded === null ? null : Number(row.marks_awarded),
    });
  }
  return out;
}

export async function readNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const rows = await readChunks([...new Set(ids)], (group) =>
    checked<{ id: string; name: string }>(db.from("profiles").select("id, name").in("id", group), "names"),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}
