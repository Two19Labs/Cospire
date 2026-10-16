// The arithmetic behind every analytics screen, kept pure so it is tested once
// here rather than trusted in each screen.
//
// Everything is counted over the four tags every question carries (operating
// manual §1.4): section, topic, difficulty and marks. Time per question is not
// recorded anywhere, so nothing here pretends to know it.
//
// One question in one sitting is a `Sitting`. A student's attempt is a list of
// them; a mock's analytics is every attempt's list joined together. The same
// `tally` then answers "by topic for this attempt", "by topic across this
// mock", and "per question across this mock" alike.
//
// **Only scored attempts reach this code.** An attempt submitted but awaiting
// its score (closed by the timer and not yet opened, or cleared by a question
// edit for rescoring) has answers with no verdict yet. Counting those as wrong
// would be a false figure, so callers split them off with `splitAwaiting` and
// say how many are waiting instead.

export type Dimension = "difficulty" | "section" | "topic";

export interface PaperQuestion {
  difficulty: string;
  id: number;
  marks: number;
  // 1-based, in the order the student met it: exactly the attempt screen's numbering.
  number: number;
  section: string;
  topic: string;
}

export interface ResponseFact {
  // Whether an answer was actually given; a response row can exist with none.
  answered: boolean;
  // Null for an essay, which is marked by a person and is never right or
  // wrong, and for an answer not yet scored at all.
  isCorrect: boolean | null;
  marksAwarded: number | null;
}

export interface Sitting {
  question: PaperQuestion;
  response: ResponseFact | undefined;
}

export interface Tally {
  // Correct as a share of those with a verdict. Null when there are none.
  accuracy: number | null;
  attempted: number;
  correct: number;
  label: string;
  marksAvailable: number;
  marksScored: number;
  // Answered, and waiting for a person to mark it: an essay nobody has marked
  // yet. **Never counted as wrong**, and the marks it may still earn are not
  // in `marksScored`, so a tally with a pending answer is provisional.
  pending: number;
  // How many question-sittings: one per question per attempt.
  questions: number;
  unattempted: number;
  wrong: number;
}

// Attempts with a score, and how many are still awaiting one.
export function splitAwaiting<T extends { score: number | null }>(attempts: T[]): { awaiting: number; scored: (T & { score: number })[] } {
  const scored = attempts.filter((attempt): attempt is T & { score: number } => attempt.score !== null);
  return { awaiting: attempts.length - scored.length, scored };
}

// Summed in hundredths, as scoring does, so 0.1 + 0.2 never shows as 0.30000000000000004.
const hundredths = (value: number) => Math.round(value * 100);

export function sittingsFor(paper: PaperQuestion[], responses: Map<number, ResponseFact>): Sitting[] {
  return paper.map((question) => ({ question, response: responses.get(question.id) }));
}

function empty(label: string): Tally {
  return { accuracy: null, attempted: 0, correct: 0, label, marksAvailable: 0, marksScored: 0, pending: 0, questions: 0, unattempted: 0, wrong: 0 };
}

// Grouped by `keyOf`, in the order each label first appears.
export function tally(sittings: Sitting[], keyOf: (question: PaperQuestion) => string): Tally[] {
  const groups = new Map<string, Tally & { available: number; scored: number }>();
  for (const { question, response } of sittings) {
    const label = keyOf(question);
    const group = groups.get(label) ?? { ...empty(label), available: 0, scored: 0 };
    group.questions += 1;
    group.available += hundredths(question.marks);
    if (response?.answered) {
      group.attempted += 1;
      // No verdict means nothing auto-scored it: an essay. Marked or not, it
      // is neither correct nor wrong, and counting it as wrong would be a
      // false figure -- the same reason `splitAwaiting` exists.
      if (response.isCorrect === null) {
        if (response.marksAwarded === null) group.pending += 1;
      } else if (response.isCorrect) {
        group.correct += 1;
      } else {
        group.wrong += 1;
      }
    } else {
      group.unattempted += 1;
    }
    group.scored += hundredths(response?.marksAwarded ?? 0);
    groups.set(label, group);
  }
  return [...groups.values()].map(({ available, scored, ...rest }) => ({
    ...rest,
    // Out of those that have a verdict, which for a paper of auto-scored
    // questions is every attempted one, exactly as before.
    accuracy: rest.correct + rest.wrong ? rest.correct / (rest.correct + rest.wrong) : null,
    marksAvailable: available / 100,
    marksScored: scored / 100,
  }));
}

export function tallyBy(sittings: Sitting[], dimension: Dimension): Tally[] {
  const rows = tally(sittings, (question) => question[dimension]);
  if (dimension === "difficulty") {
    const rank = (label: string) => {
      const index = ["easy", "medium", "hard"].indexOf(label);
      return index < 0 ? 3 : index;
    };
    return rows.sort((a, b) => rank(a.label) - rank(b.label));
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

export function overall(sittings: Sitting[]): Tally {
  return tally(sittings, () => "All questions")[0] ?? empty("All questions");
}

// The topics a student does worst in: lowest share of questions answered
// correctly (unattempted counts against, as it does in the score), then the
// topic seen more often first, since it is the better-evidenced weakness.
export function weakestTopics(sittings: Sitting[], limit = 5): Tally[] {
  const share = (row: Tally) => (row.questions ? row.correct / row.questions : 0);
  return tally(sittings, (question) => question.topic)
    .sort((a, b) => share(a) - share(b) || b.questions - a.questions || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export interface ScoreStats {
  average: number | null;
  count: number;
  lowest: number | null;
  median: number | null;
  top: number | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function scoreStats(scores: number[]): ScoreStats {
  if (!scores.length) return { average: null, count: 0, lowest: null, median: null, top: null };
  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const total = sorted.reduce((sum, value) => sum + hundredths(value), 0) / 100;
  return {
    average: round2(total / sorted.length),
    count: sorted.length,
    lowest: sorted[0],
    median: round2(median),
    top: sorted[sorted.length - 1],
  };
}

export interface Bucket {
  count: number;
  // Lower edge included, upper edge excluded -- except the last, which includes it.
  from: number;
  to: number;
}

// `bucketCount` equal buckets with exact edges, from 0 (or the worst score,
// when negative marking takes one below zero) to the paper's full marks. Edges
// are rounded to two places for display only; placement uses the exact width.
export function scoreBuckets(scores: number[], maxMarks: number, bucketCount = 5): Bucket[] {
  const low = Math.min(0, ...scores);
  const high = Math.max(maxMarks, ...scores, low + 1);
  const width = (high - low) / bucketCount;
  const edge = (index: number) => round2(low + ((high - low) * index) / bucketCount);
  const buckets: Bucket[] = Array.from({ length: bucketCount }, (_, index) => ({ count: 0, from: edge(index), to: edge(index + 1) }));
  for (const score of scores) {
    const index = Math.min(Math.max(Math.floor((score - low) / width), 0), bucketCount - 1);
    buckets[index].count += 1;
  }
  return buckets;
}

export function paperMarks(paper: PaperQuestion[]): number {
  return paper.reduce((sum, question) => sum + hundredths(question.marks), 0) / 100;
}

// A share as a whole percentage for display; a dash when there is nothing to divide.
export function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
