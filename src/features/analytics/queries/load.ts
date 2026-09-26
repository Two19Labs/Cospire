import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isAnswered } from "@/features/test-engine/answer";
import { createAdminSupabaseClient } from "@/shared/db/supabase/admin";
import { createServerSupabaseClient } from "@/shared/db/supabase/server";

import type { PaperQuestion, ResponseFact } from "../aggregate";

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
  // Answerable questions only: a DI passage carries no marks and no answer.
  questions: PaperQuestion[];
  title: string;
}

const pageSize = 1000;
// A ceiling on any one read, so a mistake can never pull an unbounded table.
const rowCeiling = 50_000;
// Ids per `.in()` filter, to keep request URLs short.
const idChunk = 150;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < rowCeiling; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to read analytics: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += idChunk) out.push(values.slice(index, index + idChunk));
  return out;
}

export async function sessionClient(): Promise<SupabaseClient> {
  return createServerSupabaseClient();
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

// Every mock's answerable questions with their four tags, and its title.
export async function readPapers(db: SupabaseClient, mockIds: number[]): Promise<Map<number, Paper>> {
  const ids = [...new Set(mockIds)];
  const papers = new Map<number, Paper>();
  if (!ids.length) return papers;

  const mocks: { id: number; title: string }[] = [];
  const placed: { mock_id: number; question_id: number }[] = [];
  for (const group of chunks(ids)) {
    const { data, error } = await db.from("mocks").select("id, title").in("id", group);
    if (error) throw new Error(`Unable to read mocks: ${error.message}`);
    mocks.push(...(data ?? []));
    placed.push(
      ...(await readAll<{ mock_id: number; question_id: number }>((from, to) =>
        db.from("mock_questions").select("mock_id, question_id").in("mock_id", group).order("mock_id").order("question_id").range(from, to),
      )),
    );
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
  const columns = "id, parent_id, type, section_id, topic, difficulty, marks";
  const topIds = [...new Set(placed.map((row) => row.question_id))];
  const questions = new Map<number, QuestionRecord>();
  for (const group of chunks(topIds)) {
    const [top, children] = await Promise.all([
      readAll<QuestionRecord>((from, to) => db.from("questions").select(columns).in("id", group).order("id").range(from, to)),
      // Sub-questions of a placed DI passage, as the attempt screen shows them.
      readAll<QuestionRecord>((from, to) =>
        db.from("questions").select(columns).in("parent_id", group).is("archived_at", null).order("id").range(from, to),
      ),
    ]);
    for (const row of [...top, ...children]) questions.set(row.id, row);
  }

  const sectionIds = [...new Set([...questions.values()].map((row) => row.section_id))];
  const sectionNames = new Map<number, string>();
  for (const group of chunks(sectionIds)) {
    const { data, error } = await db.from("question_sections").select("id, name").in("id", group);
    if (error) throw new Error(`Unable to read sections: ${error.message}`);
    for (const row of data ?? []) sectionNames.set(row.id, row.name);
  }

  const tag = (row: QuestionRecord): PaperQuestion => ({
    difficulty: row.difficulty,
    id: row.id,
    marks: Number(row.marks),
    section: sectionNames.get(row.section_id) ?? "Unnamed section",
    topic: row.topic,
  });

  for (const mock of mocks) {
    const answerable = new Map<number, PaperQuestion>();
    for (const { question_id: placedId } of placed.filter((row) => row.mock_id === mock.id)) {
      const row = questions.get(placedId);
      if (!row) continue;
      if (row.type === "di_stimulus") {
        for (const child of questions.values()) {
          if (child.parent_id === row.id && child.type !== "di_stimulus") answerable.set(child.id, tag(child));
        }
      } else {
        answerable.set(row.id, tag(row));
      }
    }
    papers.set(mock.id, { mockId: mock.id, questions: [...answerable.values()].sort((a, b) => a.id - b.id), title: mock.title });
  }
  return papers;
}

// Each attempt's responses, keyed by question. Read through the caller's own
// session, so RLS decides whose answers come back.
export async function readResponses(db: SupabaseClient, attemptIds: number[]): Promise<Map<number, Map<number, ResponseFact>>> {
  const out = new Map<number, Map<number, ResponseFact>>();
  for (const id of attemptIds) out.set(id, new Map());
  interface ResponseRecord {
    answer: unknown;
    attempt_id: number;
    is_correct: boolean | null;
    marks_awarded: number | string | null;
    question_id: number;
  }
  for (const group of chunks(attemptIds)) {
    const rows = await readAll<ResponseRecord>((from, to) =>
      db
        .from("attempt_responses")
        .select("attempt_id, question_id, answer, is_correct, marks_awarded")
        .in("attempt_id", group)
        .order("attempt_id")
        .order("question_id")
        .range(from, to),
    );
    for (const row of rows) {
      out.get(row.attempt_id)?.set(row.question_id, {
        answered: isAnswered(row.answer),
        isCorrect: row.is_correct,
        marksAwarded: row.marks_awarded === null ? null : Number(row.marks_awarded),
      });
    }
  }
  return out;
}

export async function readNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const group of chunks([...new Set(ids)])) {
    const { data, error } = await db.from("profiles").select("id, name").in("id", group);
    if (error) throw new Error(`Unable to read names: ${error.message}`);
    for (const row of data ?? []) names.set(row.id, row.name);
  }
  return names;
}
