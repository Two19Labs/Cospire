import { describe, expect, it } from "vitest";
import { readAnswer } from "./answer";
import { attemptDeadline, isOver, secondsLeft, sectionDeadline } from "./clock";
import { scoreAttempt, type ScoringQuestion } from "./scoring";

const mcq: ScoringQuestion = { id: 1, key: { options: ["b"] }, marks: 3, type: "mcq" };
const multi: ScoringQuestion = { id: 2, key: { options: ["a", "c"] }, marks: 3, type: "mcq_multi" };
const tita: ScoringQuestion = { id: 3, key: { accepted: ["1/2"] }, marks: 3, type: "numerical" };
const passage: ScoringQuestion = { id: 4, key: null, marks: 0, type: "di_stimulus" };
const cat = { negativeMarking: 1, negativeMarkingTypes: ["mcq", "mcq_multi"] };

function score(answers: [number, unknown][], rules = cat) {
  return scoreAttempt([mcq, multi, tita, passage], new Map(answers), rules);
}

describe("scoring, operating manual §13.1", () => {
  it("awards the question's marks for a correct answer", () => {
    const result = score([[1, { options: ["b"] }], [2, { options: ["c", "a"] }], [3, { value: ".50" }]]);
    expect(result.score).toBe(9);
    expect(result.responses.every((response) => response.isCorrect)).toBe(true);
  });

  it("scores an unanswered question 0 and keeps it apart from wrong", () => {
    const result = score([[1, null], [2, { options: [] }], [3, { value: "  " }]]);
    expect(result.score).toBe(0);
    expect(result.responses).toEqual([
      { isCorrect: null, marksAwarded: null, questionId: 1 },
      { isCorrect: null, marksAwarded: null, questionId: 2 },
      { isCorrect: null, marksAwarded: null, questionId: 3 },
    ]);
  });

  it("penalises a wrong MCQ and leaves a wrong TITA at 0, as in CAT", () => {
    const result = score([[1, { options: ["a"] }], [2, { options: ["a"] }], [3, { value: "0.4" }]]);
    expect(result.responses.map((response) => response.marksAwarded)).toEqual([-1, -1, 0]);
    expect(result.score).toBe(-2);
  });

  it("penalises TITA only when the mock lists it", () => {
    const result = score([[3, { value: "7" }]], { negativeMarking: 0.5, negativeMarkingTypes: ["numerical"] });
    expect(result.responses[2]).toEqual({ isCorrect: false, marksAwarded: -0.5, questionId: 3 });
  });

  it("with negative marking off, a wrong answer is 0, not -0", () => {
    const result = score([[1, { options: ["a"] }]], { negativeMarking: 0, negativeMarkingTypes: ["mcq"] });
    expect(Object.is(result.responses[0].marksAwarded, 0)).toBe(true);
    expect(Object.is(result.score, 0)).toBe(true);
  });

  it("gives no partial credit on a multiple-correct MCQ", () => {
    const result = score([[2, { options: ["a"] }]]);
    expect(result.responses[1].isCorrect).toBe(false);
  });

  it("skips a DI passage, which has no marks", () => {
    expect(score([]).responses.map((response) => response.questionId)).toEqual([1, 2, 3]);
  });

  it("treats a malformed stored answer as wrong, never as an error", () => {
    const result = score([[1, { options: "b" }], [3, { value: 5 }]]);
    expect(result.responses[0].isCorrect).toBe(null);
    expect(result.responses[2].isCorrect).toBe(null);
    const typed = score([[1, { value: "b" }]]);
    expect(typed.responses[0]).toEqual({ isCorrect: false, marksAwarded: -1, questionId: 1 });
  });

  it("sums fractional marks without floating-point drift", () => {
    const rules = { negativeMarking: 0.1, negativeMarkingTypes: ["mcq", "mcq_multi"] };
    const result = scoreAttempt(
      [{ ...mcq, id: 1 }, { ...mcq, id: 2 }, { ...mcq, id: 3 }],
      new Map([[1, { options: ["a"] }], [2, { options: ["a"] }], [3, { options: ["a"] }]]),
      rules,
    );
    expect(result.score).toBe(-0.3);
  });
});

describe("reading an answer from a form post", () => {
  const options = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("stores a choice in the question's own option order", () => {
    expect(readAnswer({ options, type: "mcq_multi" }, ["c", "a", "a"])).toEqual({ options: ["a", "c"] });
  });

  it("refuses an option the question does not have, and two on a single MCQ", () => {
    expect(readAnswer({ options, type: "mcq" }, ["z"])).toBe("invalid");
    expect(readAnswer({ options, type: "mcq" }, ["a", "b"])).toBe("invalid");
  });

  it("keeps a typed answer as typed, and a blank as no answer", () => {
    expect(readAnswer({ options: [], type: "numerical" }, [" 1/2 "])).toEqual({ value: "1/2" });
    expect(readAnswer({ options: [], type: "numerical" }, ["   "])).toBe(null);
    expect(readAnswer({ options: [], type: "numerical" }, ["9".repeat(51)])).toBe("invalid");
  });

  it("never takes an answer for a DI passage", () => {
    expect(readAnswer({ options: [], type: "di_stimulus" }, ["x"])).toBe("invalid");
  });
});

describe("the clock", () => {
  const start = new Date("2026-10-01T10:00:00Z");
  const paper = attemptDeadline(start, 120);

  it("ends the paper after its duration", () => {
    expect(paper.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("ends a timed section on its own clock, capped by the paper's", () => {
    expect(sectionDeadline(new Date("2026-10-01T10:05:00Z"), 40, paper).toISOString()).toBe("2026-10-01T10:45:00.000Z");
    expect(sectionDeadline(new Date("2026-10-01T11:50:00Z"), 40, paper)).toEqual(paper);
    expect(sectionDeadline(start, null, paper)).toEqual(paper);
  });

  it("counts down to zero and no further, and is over only after the grace", () => {
    expect(secondsLeft(paper, new Date("2026-10-01T11:59:00Z"))).toBe(60);
    expect(secondsLeft(paper, new Date("2026-10-01T12:30:00Z"))).toBe(0);
    expect(isOver(paper, new Date("2026-10-01T12:00:29Z"))).toBe(false);
    expect(isOver(paper, new Date("2026-10-01T12:00:31Z"))).toBe(true);
  });
});
