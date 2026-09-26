import { describe, expect, it } from "vitest";

import {
  overall,
  paperMarks,
  percent,
  scoreBuckets,
  scoreStats,
  sittingsFor,
  splitAwaiting,
  tally,
  tallyBy,
  weakestTopics,
  type PaperQuestion,
  type ResponseFact,
} from "./aggregate";

const paper: PaperQuestion[] = [
  { difficulty: "easy", id: 1, marks: 3, number: 1, section: "QA", topic: "Algebra" },
  { difficulty: "hard", id: 2, marks: 3, number: 2, section: "QA", topic: "Algebra" },
  { difficulty: "medium", id: 3, marks: 3, number: 3, section: "QA", topic: "Geometry" },
  { difficulty: "easy", id: 4, marks: 3, number: 4, section: "VARC", topic: "Reading" },
];
const right: ResponseFact = { answered: true, isCorrect: true, marksAwarded: 3 };
const wrong: ResponseFact = { answered: true, isCorrect: false, marksAwarded: -1 };
const titaWrong: ResponseFact = { answered: true, isCorrect: false, marksAwarded: 0 };
// A row saved and then cleared: it exists, but carries no answer.
const cleared: ResponseFact = { answered: false, isCorrect: null, marksAwarded: null };

describe("tallying one attempt", () => {
  const sittings = sittingsFor(paper, new Map([[1, right], [2, wrong], [3, cleared]]));

  it("counts attempted, correct, wrong and unattempted, never-opened included", () => {
    expect(overall(sittings)).toEqual({
      accuracy: 0.5, attempted: 2, correct: 1, label: "All questions", marksAvailable: 12, marksScored: 2, questions: 4, unattempted: 2, wrong: 1,
    });
  });

  it("splits by section, topic and difficulty", () => {
    expect(tallyBy(sittings, "section").map((row) => [row.label, row.correct, row.wrong, row.unattempted, row.marksScored])).toEqual([
      ["QA", 1, 1, 1, 2],
      ["VARC", 0, 0, 1, 0],
    ]);
    expect(tallyBy(sittings, "topic").map((row) => [row.label, row.attempted, row.accuracy])).toEqual([
      ["Algebra", 2, 0.5],
      ["Geometry", 0, null],
      ["Reading", 0, null],
    ]);
    // easy, medium, hard -- in that order, not alphabetical.
    expect(tallyBy(sittings, "difficulty").map((row) => [row.label, row.questions, row.correct])).toEqual([
      ["easy", 2, 1],
      ["medium", 1, 0],
      ["hard", 1, 0],
    ]);
  });

  it("a wrong answer with no penalty is still wrong, and scores zero", () => {
    const row = overall(sittingsFor(paper.slice(0, 1), new Map([[1, titaWrong]])));
    expect([row.wrong, row.marksScored]).toEqual([1, 0]);
  });

  it("sums fractional marks without floating-point drift", () => {
    const tenth: ResponseFact = { answered: true, isCorrect: true, marksAwarded: 0.1 };
    const fifth: ResponseFact = { answered: true, isCorrect: true, marksAwarded: 0.2 };
    expect(overall(sittingsFor(paper.slice(0, 2), new Map([[1, tenth], [2, fifth]]))).marksScored).toBe(0.3);
  });
});

describe("across attempts", () => {
  const first = sittingsFor(paper, new Map([[1, right], [2, wrong]]));
  const second = sittingsFor(paper, new Map([[1, wrong], [3, right]]));

  it("per question: sittings, share correct and share unattempted", () => {
    const rows = tally([...first, ...second], (question) => String(question.id));
    expect(rows.map((row) => [row.label, row.questions, row.correct, row.unattempted])).toEqual([
      ["1", 2, 1, 0],
      ["2", 2, 0, 1],
      ["3", 2, 1, 1],
      ["4", 2, 0, 2],
    ]);
  });

  it("weakest topics: lowest share correct first, the better-evidenced one ahead on a tie", () => {
    expect(weakestTopics([...first, ...second]).map((row) => row.label)).toEqual(["Reading", "Algebra", "Geometry"]);
    expect(weakestTopics([...first, ...second], 1)).toHaveLength(1);
  });
});

describe("score statistics", () => {
  it("average, median, top and lowest", () => {
    expect(scoreStats([2, 9, -1, 4])).toEqual({ average: 3.5, count: 4, lowest: -1, median: 3, top: 9 });
    expect(scoreStats([5, 1, 3]).median).toBe(3);
  });

  it("nothing to count gives dashes, not zeros", () => {
    expect(scoreStats([])).toEqual({ average: null, count: 0, lowest: null, median: null, top: null });
    expect(percent(null)).toBe("—");
    expect(percent(2 / 3)).toBe("67%");
  });

  it("buckets from zero to full marks, every score counted once, full marks in the last", () => {
    const buckets = scoreBuckets([0, 3, 6, 12], 12, 4);
    expect(buckets).toEqual([
      { count: 1, from: 0, to: 3 },
      { count: 1, from: 3, to: 6 },
      { count: 1, from: 6, to: 9 },
      { count: 1, from: 9, to: 12 },
    ]);
  });

  it("stretches below zero when negative marking takes a score there", () => {
    const buckets = scoreBuckets([-2, 5], 6, 4);
    expect(buckets.map((bucket) => [bucket.from, bucket.to, bucket.count])).toEqual([
      [-2, 0, 1],
      [0, 2, 0],
      [2, 4, 0],
      [4, 6, 1],
    ]);
  });

  it("fractional full marks: exact edges, every bucket kept, the top edge is the real maximum", () => {
    const buckets = scoreBuckets([0, 3.5, 7.5], 7.5, 5);
    expect(buckets.map((bucket) => [bucket.from, bucket.to])).toEqual([
      [0, 1.5],
      [1.5, 3],
      [3, 4.5],
      [4.5, 6],
      [6, 7.5],
    ]);
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 0, 1, 0, 1]);
  });

  it("uneven widths round only for display, and a score on an edge goes up", () => {
    const buckets = scoreBuckets([10 / 3, 10], 10, 3);
    expect(buckets.map((bucket) => bucket.from)).toEqual([0, 3.33, 6.67]);
    expect(buckets.map((bucket) => bucket.count)).toEqual([0, 1, 1]);
  });

  it("the paper's full marks", () => {
    expect(paperMarks(paper)).toBe(12);
  });
});

describe("attempts awaiting a score", () => {
  it("are split off, never counted, and counted as waiting", () => {
    const { awaiting, scored } = splitAwaiting([
      { id: 1, score: 5 },
      { id: 2, score: null },
      { id: 3, score: 0 },
    ]);
    expect(awaiting).toBe(1);
    // A score of zero is a score, not a missing one.
    expect(scored.map((row) => row.id)).toEqual([1, 3]);
  });
});
