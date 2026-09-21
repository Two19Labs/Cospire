import { describe, expect, it } from "vitest";

import { applyDefaultMarks, matchSection, parseDefaultMarks, reviewProblems, stagedToFormValues } from "./import-review";
import type { StagedQuestion } from "./import-spec";
import { parseBatchId } from "./import-state";

const staged: StagedQuestion = {
  accepted: [],
  body: "Q",
  correctOptions: [1],
  difficulty: "easy",
  marks: "",
  notes: [],
  options: ["a", "b"],
  parentPosition: null,
  sectionName: "qa",
  solution: "",
  source: "Q",
  tolerance: "",
  topic: "Ratios",
  type: "mcq",
};

const sections = [
  { id: 4, name: "QA" },
  { id: 5, name: "DILR" },
];

describe("import review helpers", () => {
  it("matches a section only by its exact name, ignoring case", () => {
    expect(matchSection(" qa ", sections)).toBe(4);
    expect(matchSection("Quant", sections)).toBeNull();
    expect(matchSection("", sections)).toBeNull();
  });

  it("reads default marks, blank meaning none", () => {
    expect(parseDefaultMarks("3")).toBe("3");
    expect(parseDefaultMarks("")).toBe("");
    expect(parseDefaultMarks("0")).toBeNull();
    expect(parseDefaultMarks("three")).toBeNull();
  });

  it("fills marks only where the document gave none, and never on a passage", () => {
    expect(applyDefaultMarks(staged, "3").marks).toBe("3");
    expect(applyDefaultMarks({ ...staged, marks: "2" }, "3").marks).toBe("2");
    expect(applyDefaultMarks({ ...staged, marks: "0", type: "di_stimulus" }, "3").marks).toBe("0");
  });

  it("names what is left to fix, using the approval validator", () => {
    expect(reviewProblems(staged, 4, 1)).toEqual([
      "Marks must be a number above 0 and at most 100, with up to two decimals.",
    ]);
    expect(reviewProblems({ ...staged, marks: "3" }, null, 1)).toEqual(["Choose a section."]);
    expect(reviewProblems({ ...staged, marks: "3", parentPosition: 0 }, null, 1)).toEqual([]);
  });

  it("opens a staged question in the editor with its section matched", () => {
    expect(stagedToFormValues(staged, 4)).toMatchObject({ correctOptions: [1], options: ["a", "b"], sectionId: "4" });
  });

  it("accepts only a UUID as a batch id", () => {
    expect(parseBatchId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(parseBatchId("1 or 1=1")).toBeNull();
  });
});
