import { describe, expect, it } from "vitest";

import {
  applyDefaultMarks,
  attachFigures,
  matchSection,
  parseDefaultMarks,
  reviewProblems,
  stagedToFormValues,
} from "./import-review";
import type { StagedQuestion } from "./import-spec";
import { parseBatchId } from "./import-state";

const staged: StagedQuestion = {
  accepted: [],
  body: "Q",
  correctOptions: [1],
  difficulty: "easy",
  figures: [],
  images: [],
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

describe("attachFigures", () => {
  const path = (n: number) => `org/1/questions/0000000${n}-0000-4000-8000-000000000000.png`;

  it("turns each figure number into the image the upload stored", () => {
    const out = attachFigures({ ...staged, figures: [2, 5] }, { 2: path(2), 5: path(5) });
    expect(out.images).toEqual([path(2), path(5)]);
    expect(out.notes).toEqual([]);
  });

  it("leaves a question with no figures exactly as it was", () => {
    const out = attachFigures(staged, { 1: path(1) });
    expect(out).toBe(staged);
  });

  it("names the figures it could not attach rather than passing over them", () => {
    // Figure 3 is an EMF drawing or a Word chart: numbered in the text, with
    // nothing in the bucket behind it.
    const out = attachFigures({ ...staged, figures: [1, 3] }, { 1: path(1) });
    expect(out.images).toEqual([path(1)]);
    expect(out.notes.join(" ")).toMatch(/Figure 3 was not taken out of the document\. Paste it in/);
  });

  it("says figures, plural, when more than one is missing", () => {
    const out = attachFigures({ ...staged, figures: [4, 7] }, {});
    expect(out.images).toEqual([]);
    expect(out.notes.join(" ")).toMatch(/Figures 4, 7 were not taken out/);
  });

  it("attaches one image once when a question names the same figure twice", () => {
    const out = attachFigures({ ...staged, figures: [2] }, { 2: path(2) });
    expect(out.images).toEqual([path(2)]);
  });

  it("keeps at most the ten images a question may carry, and says so", () => {
    const figures = Array.from({ length: 12 }, (_, index) => index + 1);
    const paths = Object.fromEntries(figures.map((n) => [n, path(n % 10)]));
    const out = attachFigures({ ...staged, figures }, paths);
    expect(out.images.length).toBeLessThanOrEqual(10);
    expect(reviewProblems(out, 1, 1)).not.toContain("A question can carry at most 10 images.");
  });

  it("keeps the notes the parser already made", () => {
    const out = attachFigures({ ...staged, figures: [9], notes: ["An option contains figure 9."] }, {});
    expect(out.notes[0]).toBe("An option contains figure 9.");
    expect(out.notes).toHaveLength(2);
  });
});
