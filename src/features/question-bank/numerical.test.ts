import { describe, expect, it } from "vitest";

import { isNumericalAnswerCorrect, parseNumericalAnswer } from "./numerical";

const half = { accepted: ["1/2"] };

describe("isNumericalAnswerCorrect", () => {
  it.each(["0.5", "1/2", ".50", "0.50", ".5", " 0.5 ", "1 / 2", "2/4", "0.500000", "+0.5"])(
    "reads %j as one half",
    (typed) => {
      expect(isNumericalAnswerCorrect(typed, half)).toBe(true);
    },
  );

  it.each(["0.51", "-0.5", "5", "1/3", "", "   ", "half", "0.5.0", "1/2/3", "5e-1", "50%", "1/0"])(
    "does not read %j as one half",
    (typed) => {
      expect(isNumericalAnswerCorrect(typed, half)).toBe(false);
    },
  );

  it("compares exactly, not in floating point", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary; 3/10 is exactly 0.3.
    expect(isNumericalAnswerCorrect("0.3", { accepted: ["3/10"] })).toBe(true);
    expect(isNumericalAnswerCorrect("0.30000000000000004", { accepted: ["0.3"] })).toBe(false);
  });

  it("accepts any one of several listed forms", () => {
    const key = { accepted: ["25", "25.0"] };
    expect(isNumericalAnswerCorrect("25", key)).toBe(true);
    expect(isNumericalAnswerCorrect("25.00", key)).toBe(true);
    expect(isNumericalAnswerCorrect("24", key)).toBe(false);
  });

  it("handles negatives, including a pasted minus sign", () => {
    const key = { accepted: ["-3/4"] };
    expect(isNumericalAnswerCorrect("-0.75", key)).toBe(true);
    expect(isNumericalAnswerCorrect("−0.75", key)).toBe(true);
    expect(isNumericalAnswerCorrect("3/-4", key)).toBe(true);
    expect(isNumericalAnswerCorrect("0.75", key)).toBe(false);
  });

  it("treats zero and negative zero as the same", () => {
    expect(isNumericalAnswerCorrect("-0", { accepted: ["0"] })).toBe(true);
    expect(isNumericalAnswerCorrect("0.000", { accepted: ["0"] })).toBe(true);
  });

  it("reads correctly grouped thousands and refuses ambiguous commas", () => {
    const key = { accepted: ["1250"] };
    expect(isNumericalAnswerCorrect("1,250", key)).toBe(true);
    expect(isNumericalAnswerCorrect("1,25,0", key)).toBe(false);
    expect(isNumericalAnswerCorrect("1,5", { accepted: ["1.5"] })).toBe(false);
  });

  it("applies a tolerance, inclusive at the boundary", () => {
    const key = { accepted: ["3.14"], tolerance: 0.01 };
    expect(isNumericalAnswerCorrect("3.15", key)).toBe(true);
    expect(isNumericalAnswerCorrect("3.13", key)).toBe(true);
    expect(isNumericalAnswerCorrect("22/7", key)).toBe(true);
    expect(isNumericalAnswerCorrect("3.16", key)).toBe(false);
  });

  it("ignores a zero or negative tolerance and compares exactly", () => {
    expect(isNumericalAnswerCorrect("3.15", { accepted: ["3.14"], tolerance: 0 })).toBe(false);
    expect(isNumericalAnswerCorrect("3.15", { accepted: ["3.14"], tolerance: -1 })).toBe(false);
  });

  it("stays exact on numbers too large for a float", () => {
    const key = { accepted: ["12345678901234567890"] };
    expect(isNumericalAnswerCorrect("12345678901234567890", key)).toBe(true);
    expect(isNumericalAnswerCorrect("12345678901234567891", key)).toBe(false);
  });

  it("marks an unreadable key form wrong rather than throwing", () => {
    expect(isNumericalAnswerCorrect("5", { accepted: ["five", "5"] })).toBe(true);
    expect(isNumericalAnswerCorrect("5", { accepted: ["five"] })).toBe(false);
  });

  it("refuses anything longer than the answer box allows", () => {
    expect(parseNumericalAnswer("1".repeat(51))).toBeNull();
  });
});
