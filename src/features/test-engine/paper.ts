// The shape of a paper as a student moves through it, worked out from rows the
// database returned. Pure, so the rules for "which section is open" are tested
// here once rather than rediscovered in each screen.
//
// Two modes, decided by the mock:
//   - free:       no section is timed. One clock, every question reachable.
//   - sequential: at least one section is timed. Sections are sat in order,
//                 one at a time, each on its own clock inside the paper's.
// The database enforces the same rules (20260926103000_test_engine_attempts);
// this only has to agree with it so the screen never offers a refused move.

import { attemptDeadline, sectionDeadline } from "./clock";

export interface PaperSection {
  durationMinutes: number | null;
  id: number;
  sortOrder: number;
  title: string;
}

export interface EnteredSection {
  sectionId: number;
  startedAt: Date;
  submittedAt: Date | null;
}

export interface PaperItem {
  // 1-based across the whole paper, as a student counts.
  number: number;
  questionId: number;
  sectionId: number;
  // The DI passage a sub-question belongs to, if any.
  stimulusId: number | null;
}

// Top-level rows of the paper in order: a question, or a DI passage whose
// sub-questions (in id order) are what the student actually answers.
export interface PlacedQuestion {
  childIds: number[];
  isStimulus: boolean;
  questionId: number;
  sectionId: number;
}

export function buildItems(sections: PaperSection[], placed: PlacedQuestion[]): PaperItem[] {
  const items: PaperItem[] = [];
  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const section of ordered) {
    for (const row of placed.filter((entry) => entry.sectionId === section.id)) {
      const answerable = row.isStimulus ? row.childIds : [row.questionId];
      for (const questionId of answerable) {
        items.push({
          number: items.length + 1,
          questionId,
          sectionId: section.id,
          stimulusId: row.isStimulus ? row.questionId : null,
        });
      }
    }
  }
  return items;
}

export type PaperState =
  // Answering is possible in `sectionId` (null in free mode: every section).
  | { deadline: Date; kind: "open"; sectionId: number | null }
  // Sequential only: the previous section is over and this one must be entered.
  | { kind: "enter"; sectionId: number }
  // Nothing more can be answered; the attempt only needs closing.
  | { kind: "over" };

export function isSequential(sections: PaperSection[]): boolean {
  return sections.some((section) => section.durationMinutes !== null);
}

// The screen moves on at the deadline itself. The grace the database allows
// past it exists only so a save already in flight when the clock hits zero is
// not lost; it is never extra time to show.
function passed(deadline: Date, now: Date): boolean {
  return now.getTime() >= deadline.getTime();
}

export function paperState(
  sections: PaperSection[],
  entered: EnteredSection[],
  startedAt: Date,
  mockMinutes: number,
  now: Date,
): PaperState {
  const paperEnd = attemptDeadline(startedAt, mockMinutes);
  if (passed(paperEnd, now)) return { kind: "over" };
  if (!isSequential(sections)) return { deadline: paperEnd, kind: "open", sectionId: null };

  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const section of ordered) {
    const row = entered.find((entry) => entry.sectionId === section.id);
    if (!row) return { kind: "enter", sectionId: section.id };
    if (row.submittedAt) continue;
    const end = sectionDeadline(row.startedAt, section.durationMinutes, paperEnd);
    if (!passed(end, now)) return { deadline: end, kind: "open", sectionId: section.id };
  }
  return { kind: "over" };
}

// The next section after `sectionId` in order, or null after the last.
export function nextSection(sections: PaperSection[], sectionId: number): PaperSection | null {
  const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((section) => section.id === sectionId);
  return index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
}
