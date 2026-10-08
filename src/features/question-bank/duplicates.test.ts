import { describe, expect, it } from "vitest";

import {
  canonicalOptions,
  choiceKey,
  judgePaper,
  numericalKey,
  type Comparable,
  type MatchContext,
  type PaperEntry,
  type TextMatch,
} from "./duplicates";

// The cases mirror `C:\Cospire\Test Documents\02 Question paper B`, checked
// against paper A, row by row of the decision table in
// docs/decisions/2026-10-02-decision-statement.md.

const mcq = (options: string[], correct: number[], images: string[] = []): Comparable => ({
  images,
  key: choiceKey(correct),
  options: canonicalOptions(options),
  tolerance: "",
  type: "mcq",
});
const tita = (accepted: string[]): Comparable => ({ images: [], key: numericalKey(accepted), options: [], tolerance: "", type: "numerical" });
const passage = (images: string[] = []): Comparable => ({ images, key: [], options: [], tolerance: "", type: "di_stimulus" });

const entry = (position: number, comparable: Comparable, parentPosition: number | null = null): PaperEntry => ({
  comparable,
  parentPosition,
  position,
});
const bank = (inputIndex: number, ref: number, sameText: boolean, similarity = sameText ? 1 : 0.8): TextMatch => ({
  inputIndex,
  kind: "bank",
  ref,
  sameText,
  similarity,
});
const earlier = (inputIndex: number, ref: number, sameText: boolean, similarity = sameText ? 1 : 0.8): TextMatch => ({
  inputIndex,
  kind: "paper",
  ref,
  sameText,
  similarity,
});
const context = (matches: TextMatch[], bankRows: Array<[number, Comparable]> = [], sets: MatchContext["bankSets"] = new Map()): MatchContext => ({
  bank: new Map(bankRows),
  bankSets: sets,
  matches,
});

describe("keys compare by meaning, options by order", () => {
  it("treats 0.5 and 1/2 as one numerical key", () => {
    expect(numericalKey(["0.5"])).toEqual(numericalKey(["1/2"]));
    expect(numericalKey(["0.5", "1/2"])).toEqual(numericalKey(["1/2"]));
  });

  it("ignores case and spacing in option text, but not order", () => {
    expect(canonicalOptions(["  7.2 ", "Six"])).toEqual(["7.2", "six"]);
    expect(canonicalOptions(["6", "7.2"])).not.toEqual(canonicalOptions(["7.2", "6"]));
  });
});

describe("the duplicate decision table", () => {
  const profitA = mcq(["12%", "15%", "18%", "20%"], [1]);

  it("links an exact copy automatically", () => {
    const verdicts = judgePaper([entry(0, profitA)], context([bank(0, 376, true)], [[376, profitA]]));
    expect(verdicts.get(0)).toEqual({ kind: "same", questionId: 376 });
  });

  it("flags the same text with its options reordered, rather than linking it", () => {
    const reordered = mcq(["6", "7.5", "7.2", "8"], [2]);
    const original = mcq(["6", "7.2", "7.5", "8"], [1]);
    const verdict = judgePaper([entry(0, reordered)], context([bank(0, 377, true)], [[377, original]])).get(0);
    expect(verdict?.kind).toBe("possible");
  });

  it("never links a variant, whose text differs by one number", () => {
    const verdict = judgePaper([entry(0, tita(["1"]))], context([bank(0, 378, false, 0.92)], [[378, tita(["0.5"])]])).get(0);
    expect(verdict).toEqual({ kind: "possible", candidates: [{ questionId: 378, sameText: false, similarity: 0.92, source: "bank" }] });
  });

  it("flags a corrected version (typo fixed) for a person to decide", () => {
    const verdict = judgePaper([entry(0, tita(["18"]))], context([bank(0, 381, false, 0.86)], [[381, tita(["18"])]])).get(0);
    expect(verdict?.kind).toBe("possible");
  });

  it("does not link the same text when the figure differs", () => {
    const withQuarter = mcq(["a", "b", "c", "d"], [2], ["hash-quarter"]);
    const withCircle = mcq(["a", "b", "c", "d"], [0], ["hash-circle"]);
    const verdict = judgePaper([entry(0, withQuarter)], context([bank(0, 380, true)], [[380, withCircle]])).get(0);
    expect(verdict?.kind).toBe("possible");
  });

  it("catches an exact repeat inside the same paper", () => {
    const train = tita(["75"]);
    const verdicts = judgePaper([entry(0, train), entry(1, train)], context([earlier(1, 0, true)]));
    expect(verdicts.get(0)).toEqual({ kind: "new" });
    expect(verdicts.get(1)).toEqual({ kind: "repeat", position: 0 });
  });

  it("calls a question with no match new", () => {
    expect(judgePaper([entry(0, tita(["59"]))], context([])).get(0)).toEqual({ kind: "new" });
  });
});

describe("DI sets are all or nothing (28 Sept D4)", () => {
  const storeB = tita(["95"]);
  const growth = mcq(["A", "B", "C", "D"], [2]);
  const ratio = mcq(["80%", "85%", "88.9%", "90%"], [2]);
  const bankSet = new Map([[383, { children: [{ comparable: storeB, id: 384 }, { comparable: growth, id: 385 }, { comparable: ratio, id: 386 }] }]]);
  const bankRows: Array<[number, Comparable]> = [[383, passage(["chart"])]];

  it("links a set whose passage and every sub-question match, in order", () => {
    const entries = [entry(0, passage(["chart"])), entry(1, storeB, 0), entry(2, growth, 0), entry(3, ratio, 0)];
    const matches = [bank(0, 383, true), bank(1, 384, true), bank(2, 385, true), bank(3, 386, true)];
    const verdicts = judgePaper(entries, context(matches, bankRows, bankSet));
    expect([...verdicts.values()]).toEqual([
      { kind: "same", questionId: 383 },
      { kind: "same", questionId: 384 },
      { kind: "same", questionId: 385 },
      { kind: "same", questionId: 386 },
    ]);
  });

  it("makes a new set when a sub-question is new, naming the set it resembles", () => {
    const combined = tita(["59"]);
    const entries = [entry(0, passage(["chart"])), entry(1, storeB, 0), entry(2, growth, 0), entry(3, combined, 0)];
    const matches = [bank(0, 383, true), bank(1, 384, true), bank(2, 385, true)];
    const verdicts = judgePaper(entries, context(matches, bankRows, bankSet));
    expect(verdicts.get(0)).toMatchObject({ kind: "new", note: expect.stringContaining("Q00383") });
    expect([1, 2, 3].map((position) => verdicts.get(position))).toEqual([{ kind: "new" }, { kind: "new" }, { kind: "new" }]);
  });

  it("does not offer a sub-question of an earlier set as a match for a standalone question", () => {
    const entries = [entry(0, passage()), entry(1, storeB, 0), entry(2, storeB)];
    const verdict = judgePaper(entries, context([earlier(2, 1, true)])).get(2);
    expect(verdict).toEqual({ kind: "new" });
  });
});
