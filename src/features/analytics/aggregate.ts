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

export type Dimension = "difficulty" | "section" | "topic";

export interface PaperQuestion {
  difficulty: string;
  id: number;
  marks: number;
  section: string;
  topic: string;
}

export interface ResponseFact {
  // Whether an answer was actually given; a response row can exist with none.
  answered: boolean;
  isCorrect: boolean | null;
  marksAwarded: number | null;
}

export interface Sitting {
  question: PaperQuestion;
  response: ResponseFact | undefined;
}

export interface Tally {
  // Correct as a share of attempted. Null when nothing was attempted.
  accuracy: number | null;
  attempted: number;
  correct: number;
  label: string;
  marksAvailable: number;
  marksScored: number;
  // How many question-sittings: one per question per attempt.
  questions: number;
  unattempted: number;
  wrong: number;
}

// Summed in hundredths, as scoring does, so 0.1 + 0.2 never shows as 0.30000000000000004.
const hundredths = (value: number) => Math.round(value * 100);

export function sittingsFor(paper: PaperQuestion[], responses: Map<number, ResponseFact>): Sitting[] {
  return paper.map((question) => ({ question, response: responses.get(question.id) }));
}

function empty(label: string): Tally {
  return { accuracy: null, attempted: 0, correct: 0, label, marksAvailable: 0, marksScored: 0, questions: 0, unattempted: 0, wrong: 0 };
}

function finish(tally: Tally & { scored: number; available: number }): Tally {
  const { available, scored, ...rest } = tally;
  return {
    ...rest,
    accuracy: rest.attempted ? rest.correct / rest.attempted : null,
    marksAvailable: available / 100,
    marksScored: scored / 100,
  };
}

// Grouped by `keyOf`, in the order each label first appears unless `order` says otherwise.
export function tally(sittings: Sitting[], keyOf: (question: PaperQuestion) => string): Tally[] {
  const groups = new Map<string, Tally & { scored: number; available: number }>();
  for (const { question, response } of sittings) {
    const label = keyOf(question);
    const group = groups.get(label) ?? { ...empty(label), available: 0, scored: 0 };
    group.questions += 1;
    group.available += hundredths(question.marks);
    if (response?.answered) {
      group.attempted += 1;
      if (response.isCorrect) group.correct += 1;
      else group.wrong += 1;
    } else {
      group.unattempted += 1;
    }
    group.scored += hundredths(response?.marksAwarded ?? 0);
    groups.set(label, group);
  }
  return [...groups.values()].map(finish);
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
  // Lower bound included, upper bound excluded -- except the last, which includes it.
  from: number;
  to: number;
}

// Equal-width buckets from the lower of 0 and the worst score (negative marking
// can take a score below zero) to the paper's full marks, whole-number widths.
export function scoreBuckets(scores: number[], maxMarks: number, bucketCount = 5): Bucket[] {
  const low = Math.min(0, Math.floor(Math.min(...scores, 0)));
  const high = Math.max(Math.ceil(maxMarks), Math.ceil(Math.max(...scores, 0)), low + 1);
  const width = Math.max(1, Math.ceil((high - low) / bucketCount));
  const buckets: Bucket[] = [];
  for (let from = low; from < high; from += width) buckets.push({ count: 0, from, to: Math.min(from + width, high) });
  for (const score of scores) {
    const index = Math.min(Math.floor((score - low) / width), buckets.length - 1);
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

export function formatMarks(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}
