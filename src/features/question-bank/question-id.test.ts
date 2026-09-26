import { describe, expect, it } from "vitest";

import { formatQuestionId, formatQuestionIdList, parseQuestionRef } from "./question-id";

describe("formatQuestionId", () => {
  it("pads to five digits", () => {
    expect(formatQuestionId(42)).toBe("Q00042");
    expect(formatQuestionId(1)).toBe("Q00001");
    expect(formatQuestionId(99999)).toBe("Q99999");
  });

  it("does not truncate an id past five digits", () => {
    expect(formatQuestionId(123456)).toBe("Q123456");
  });
});

describe("parseQuestionRef", () => {
  it("reads the same question however the ID is written", () => {
    for (const written of ["Q42", "q42", "Q00042", "q00042", "Q-00042", "Q 42", "  Q00042  ", "q-42"]) {
      expect(parseQuestionRef(written)).toBe(42);
    }
  });

  it("refuses a bare number, which in a document is a duration or a count", () => {
    expect(parseQuestionRef("42")).toBeNull();
    expect(parseQuestionRef("00042")).toBeNull();
  });

  it("refuses anything that is not a reference", () => {
    for (const written of ["", "Q", "Q0", "Q00000", "QA", "Q4a", "Q-", "Q1.5", "Q 4 2", "question 42", null, 42, undefined]) {
      expect(parseQuestionRef(written)).toBeNull();
    }
  });

  it("refuses an id past Number's safe range rather than losing precision", () => {
    expect(parseQuestionRef("Q9007199254740993")).toBeNull();
    expect(parseQuestionRef("Q9007199254740991")).toBe(9_007_199_254_740_991);
  });
});

describe("formatQuestionIdList", () => {
  it("joins in the order given, which is the order a mock reads them back", () => {
    expect(formatQuestionIdList([101, 42, 7])).toBe("Q00101, Q00042, Q00007");
    expect(formatQuestionIdList([])).toBe("");
  });
});
