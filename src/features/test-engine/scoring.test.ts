import { describe, expect, it } from "vitest";
import { readAnswer } from "./answer";
import { attemptDeadline, isOver, secondsLeft, sectionDeadline } from "./clock";
import { effectiveMarks, isEssayPending, scoreAttempt, type ScoringQuestion } from "./scoring";

const mcq: ScoringQuestion = { id: 1, key: { options: ["b"] }, marks: 3, sectionId: 10, type: "mcq" };
const multi: ScoringQuestion = { id: 2, key: { options: ["a", "c"] }, marks: 3, sectionId: 10, type: "mcq_multi" };
const tita: ScoringQuestion = { id: 3, key: { accepted: ["1/2"] }, marks: 3, sectionId: 10, type: "numerical" };
const passage: ScoringQuestion = { id: 4, key: null, marks: 0, sectionId: 10, type: "di_stimulus" };
// Two essays in one section are a choice; a third sits in a section of its own.
const essayA: ScoringQuestion = { id: 5, key: null, marks: 20, sectionId: 20, type: "essay" };
const essayB: ScoringQuestion = { id: 6, key: null, marks: 20, sectionId: 20, type: "essay" };
const essayAlone: ScoringQuestion = { id: 7, key: null, marks: 10, sectionId: 30, type: "essay" };
const wrote = { text: "An essay." };

function scoreEssays(answers: [number, unknown][], awarded: [number, number][] = []) {
  return scoreAttempt([essayA, essayB, essayAlone], new Map(answers), cat, new Map(awarded));
}
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

  it("never lets a repeated option stand in for another (a crafted row)", () => {
    const result = score([[2, { options: ["a", "a"] }], [1, { options: ["b", "b"] }]]);
    expect(result.responses[1]).toEqual({ isCorrect: false, marksAwarded: -1, questionId: 2 });
    expect(result.responses[0]).toEqual({ isCorrect: false, marksAwarded: -1, questionId: 1 });
    expect(score([[2, { options: ["a", 7] }]]).responses[1].isCorrect).toBe(false);
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

describe("marks belong to the mock (D19)", () => {
  it("uses the section's marks when it sets them", () => {
    expect(effectiveMarks({ marks: 3, type: "mcq" }, 1)).toBe(1);
  });

  it("keeps the question's own marks when the section sets none, as every older mock does", () => {
    expect(effectiveMarks({ marks: 3, type: "numerical" }, null)).toBe(3);
    expect(effectiveMarks({ marks: 3, type: "numerical" }, undefined)).toBe(3);
  });

  it("gives a DI passage nothing, whatever its section says", () => {
    expect(effectiveMarks({ marks: 0, type: "di_stimulus" }, 4)).toBe(0);
  });
});

describe("the essay question type", () => {
  it("leaves an answered essay pending: no verdict, no marks, and never wrong", () => {
    const result = scoreEssays([[5, wrote]]);
    expect(result.score).toBe(0);
    expect(result.responses).toContainEqual({ isCorrect: null, marksAwarded: null, questionId: 5 });
    expect(isEssayPending(essayA, wrote, null)).toBe(true);
  });

  it("tells pending apart from unanswered by the answer, because the stored row is the same", () => {
    expect(isEssayPending(essayA, null, null)).toBe(false);
    expect(isEssayPending(essayA, { text: "   " }, null)).toBe(false);
    expect(isEssayPending(essayA, wrote, 12)).toBe(false);
    expect(isEssayPending(mcq, wrote, null)).toBe(false);
  });

  it("never penalises an essay, even where the mock penalises everything", () => {
    const result = scoreAttempt([essayAlone], new Map([[7, wrote]]), {
      negativeMarking: 2,
      negativeMarkingTypes: ["mcq", "mcq_multi", "numerical", "essay"],
    });
    expect(result.score).toBe(0);
    expect(result.responses).toEqual([{ isCorrect: null, marksAwarded: null, questionId: 7 }]);
  });

  it("includes an awarded mark in the attempt's score", () => {
    const result = scoreAttempt([essayAlone], new Map([[7, wrote]]), cat, new Map([[7, 6.5]]));
    expect(result.score).toBe(6.5);
    expect(result.responses).toEqual([{ isCorrect: null, marksAwarded: 6.5, questionId: 7 }]);
  });

  it("counts the higher-marked essay when a section's choice is both answered", () => {
    const result = scoreEssays([[5, wrote], [6, wrote]], [[5, 11], [6, 14]]);
    expect(result.score).toBe(14);
    expect(result.responses).toContainEqual({ isCorrect: null, marksAwarded: 0, questionId: 5 });
    expect(result.responses).toContainEqual({ isCorrect: null, marksAwarded: 14, questionId: 6 });
  });

  it("counts an essay in another section on its own, not against the choice", () => {
    const result = scoreEssays([[5, wrote], [6, wrote], [7, wrote]], [[5, 11], [6, 14], [7, 9]]);
    expect(result.score).toBe(23);
  });

  it("does not let an unmarked half of a choice hide the marked half", () => {
    const result = scoreEssays([[5, wrote], [6, wrote]], [[5, 11]]);
    expect(result.score).toBe(11);
  });

  it("refuses to award more than the essay is worth on this mock", () => {
    const result = scoreEssays([[7, wrote]], [[7, 99]]);
    expect(result.score).toBe(10);
  });

  it("scores an unanswered essay 0 and awards nothing for it", () => {
    const result = scoreAttempt([essayAlone], new Map([[7, null]]), cat, new Map([[7, 8]]));
    expect(result.score).toBe(0);
    expect(result.responses).toEqual([{ isCorrect: null, marksAwarded: null, questionId: 7 }]);
  });

  it("reads a typed essay answer, keeping the student's own line breaks", () => {
    const question = { options: [], type: "essay" as const };
    expect(readAnswer(question, ["  First line.\r\n\r\nSecond.  "])).toEqual({ text: "First line.\n\nSecond." });
    expect(readAnswer(question, ["   "])).toBeNull();
    expect(readAnswer(question, [])).toBeNull();
    expect(readAnswer(question, ["a", "b"])).toBe("invalid");
    expect(readAnswer(question, ["x".repeat(20001)])).toBe("invalid");
  });
});
