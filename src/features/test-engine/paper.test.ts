import { describe, expect, it } from "vitest";
import { buildItems, nextSection, paperState, type PaperSection } from "./paper";

const start = new Date("2026-10-01T10:00:00Z");
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const timed: PaperSection[] = [
  { durationMinutes: 40, id: 12, sortOrder: 1, title: "DILR" },
  { durationMinutes: 40, id: 11, sortOrder: 0, title: "VARC" },
];
const untimed: PaperSection[] = [{ durationMinutes: null, id: 20, sortOrder: 0, title: "All questions" }];

describe("laying out the paper", () => {
  it("numbers questions across sections in section order, expanding a DI set", () => {
    const items = buildItems(timed, [
      { childIds: [], isStimulus: false, questionId: 5, sectionId: 12 },
      { childIds: [], isStimulus: false, questionId: 1, sectionId: 11 },
      { childIds: [8, 9], isStimulus: true, questionId: 7, sectionId: 12 },
    ]);
    expect(items.map((item) => [item.number, item.questionId, item.stimulusId])).toEqual([
      [1, 1, null],
      [2, 5, null],
      [3, 8, 7],
      [4, 9, 7],
    ]);
  });

  it("finds the section after another in sort order", () => {
    expect(nextSection(timed, 11)?.id).toBe(12);
    expect(nextSection(timed, 12)).toBe(null);
  });
});

describe("which section is open", () => {
  it("in a free paper, everything is open until the clock runs out, and not during the grace", () => {
    expect(paperState(untimed, [], start, 60, at(59))).toEqual({ deadline: at(60), kind: "open", sectionId: null });
    expect(paperState(untimed, [], start, 60, at(60))).toEqual({ kind: "over" });
  });

  it("asks to enter the first section before anything else", () => {
    expect(paperState(timed, [], start, 80, at(0))).toEqual({ kind: "enter", sectionId: 11 });
  });

  it("keeps a section open on its own clock, then asks for the next", () => {
    const entered = [{ sectionId: 11, startedAt: at(0), submittedAt: null }];
    expect(paperState(timed, entered, start, 80, at(39))).toEqual({ deadline: at(40), kind: "open", sectionId: 11 });
    expect(paperState(timed, entered, start, 80, at(41))).toEqual({ kind: "enter", sectionId: 12 });
  });

  it("moves on when a section is left early, and caps the last by the paper's clock", () => {
    const entered = [
      { sectionId: 11, startedAt: at(0), submittedAt: at(10) },
      { sectionId: 12, startedAt: at(50), submittedAt: null },
    ];
    expect(paperState(timed, entered, start, 80, at(60))).toEqual({ deadline: at(80), kind: "open", sectionId: 12 });
  });

  it("is over when every section is done", () => {
    const entered = [
      { sectionId: 11, startedAt: at(0), submittedAt: at(10) },
      { sectionId: 12, startedAt: at(10), submittedAt: at(20) },
    ];
    expect(paperState(timed, entered, start, 80, at(21))).toEqual({ kind: "over" });
  });
});
