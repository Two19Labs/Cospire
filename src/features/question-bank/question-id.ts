// The readable form of a question's identity.
//
// `questions.id` is a `bigint` identity: the database issues it on insert, never
// reuses it, and two people importing at once cannot collide. So nothing here is
// allocated and nothing is stored -- this is a rendering of `questions.id` and a
// parser for it, and that is why the whole question-ID feature needs no
// migration. An archived question keeps its ID because the ID *is* the row.
//
// Designed 2026-09-22; see *Question IDs and mock documents* in
// `docs/context/meetings.md`.

// Five digits is what a reader can compare at a glance, and it is not a limit:
// id 123456 renders as `Q123456` rather than being truncated into a different
// question's name.
export function formatQuestionId(id: number): string {
  return `Q${String(id).padStart(5, "0")}`;
}

// `Q42`, `q00042` and `Q-00042` are the same question, because a document is
// typed by a person and a mock must not be refused over a lost zero.
//
// The `Q` is required. A bare `42` is deliberately not a question reference: in
// a mock document a bare number is a duration or a count, and in bank search it
// is a number inside a question's own text.
const referencePattern = /^q[\s-]?0*([0-9]{1,18})$/i;

export function parseQuestionRef(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(referencePattern);
  if (!match) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// What the bank and the import review hand over for copying: one line, comma
// separated, in the order given. The mock template reads exactly this back.
export function formatQuestionIdList(ids: number[]): string {
  return ids.map(formatQuestionId).join(", ");
}
