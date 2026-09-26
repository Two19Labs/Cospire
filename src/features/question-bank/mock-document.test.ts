import { describe, expect, it } from "vitest";

import { maxMockDocumentQuestions, mockDocumentTemplate, parseMockDocument } from "./mock-document";

// The document in the design (meetings.md, 2026-09-22), which is also what the
// import screen shows. A test over the template itself is what stops the screen
// and the parser drifting apart silently -- the same guard the question-import
// prompt has.
const template = mockDocumentTemplate;

function problemsOf(text: string): string[] {
  const { problems, spec } = parseMockDocument(text);
  expect(spec).toBeNull();
  return problems;
}

describe("the template in the design", () => {
  const { problems, spec } = parseMockDocument(template);

  it("parses with no problems", () => {
    expect(problems).toEqual([]);
    expect(spec).not.toBeNull();
  });

  it("reads every setting", () => {
    expect(spec).toMatchObject({
      allowMobile: false,
      durationMinutes: 120,
      maxAttempts: 1,
      negativeMarking: 1,
      negativeMarkingTypes: ["mcq", "mcq_multi"],
      proctoringEnabled: true,
      timingMode: "sectional",
      title: "CAT Full Length 3",
    });
  });

  it("reads three timed sections with their IDs in document order", () => {
    expect(spec?.sections.map((section) => [section.title, section.durationMinutes, section.refs.map((ref) => ref.id)])).toEqual([
      ["VARC", 40, [101, 102, 103]],
      ["DILR", 40, [210, 215]],
      ["QA", 40, [301, 302]],
    ]);
  });
});

describe("timing", () => {
  it("one section with no minutes is overall timing only, as the builder has it", () => {
    const { problems, spec } = parseMockDocument("Mock: Topic test\nDuration: 20\n\nSection: All questions\nQ00001, Q00002");
    expect(problems).toEqual([]);
    expect(spec?.timingMode).toBe("overall");
    expect(spec?.sections[0].durationMinutes).toBeNull();
  });

  it("refuses sectional minutes that do not add up to the duration", () => {
    expect(
      problemsOf("Mock: Bad totals\nDuration: 120\n\nSection: QA | 50\nQ00001\nSection: VARC | 50\nQ00002"),
    ).toEqual(["The section minutes add up to 100, not the 120 on the Duration line."]);
  });

  it("refuses more than one section when none of them is timed", () => {
    expect(problemsOf("Mock: Untimed\nDuration: 60\n\nSection: QA\nQ00001\nSection: VARC\nQ00002")).toEqual([
      "With more than one section, every section needs its own minutes, written “Section: VARC | 40”.",
    ]);
  });

  it("refuses a mix of timed and untimed sections, naming the untimed one's line", () => {
    expect(problemsOf("Mock: Mixed\nDuration: 60\n\nSection: QA | 60\nQ00001\nSection: VARC\nQ00002")).toEqual([
      "Line 6: section “VARC” has no minutes, and the other sections do. Either every section is timed or none is.",
    ]);
  });

  it("accepts minutes written with a unit", () => {
    expect(parseMockDocument("Mock: Units\nDuration: 40 minutes\n\nSection: QA | 40 min\nQ00001").problems).toEqual([]);
  });
});

describe("question IDs", () => {
  it("accepts every spelling of an ID, and separators a person actually types", () => {
    const { problems, spec } = parseMockDocument("Mock: Spellings\nDuration: 10\n\nSection: QA\nQ42 q00043; Q-44,Q00045\nQ46.");
    expect(problems).toEqual([]);
    expect(spec?.sections[0].refs.map((ref) => ref.id)).toEqual([42, 43, 44, 45, 46]);
  });

  it("refuses a token that is not an ID, naming the line", () => {
    expect(problemsOf("Mock: Junk\nDuration: 10\n\nSection: QA\nQ00001, 42")).toEqual([
      "Line 5: “42” is not a question ID. They are written Q00042, as the question bank shows them.",
    ]);
  });

  it("refuses the same question twice, naming both lines", () => {
    expect(problemsOf("Mock: Twice\nDuration: 10\n\nSection: QA\nQ00007\nQ00008, Q7")).toEqual([
      "Line 6: Q00007 is already in this mock, on line 5. A question cannot appear twice.",
    ]);
  });

  it("refuses IDs written above the first section line", () => {
    expect(problemsOf("Mock: Early\nDuration: 10\nQ00001\n\nSection: QA\nQ00002")).toEqual([
      "Line 3: “Q00001” comes before the first Section line. Question IDs belong under a section.",
    ]);
  });

  it("refuses a section with no IDs under it", () => {
    expect(problemsOf("Mock: Empty\nDuration: 60\n\nSection: QA | 30\nQ00001\nSection: VARC | 30")).toEqual([
      "Line 6: section “VARC” has no question IDs under it.",
    ]);
  });

  it(`refuses more than ${maxMockDocumentQuestions} questions`, () => {
    const ids = Array.from({ length: maxMockDocumentQuestions + 1 }, (_, index) => `Q${index + 1}`).join(", ");
    const problems = problemsOf(`Mock: Too many\nDuration: 60\n\nSection: QA\n${ids}`);
    expect(problems[0]).toContain(`names more than ${maxMockDocumentQuestions} questions`);
  });
});

describe("sections", () => {
  it("refuses two sections with the same name, which the database would refuse anyway", () => {
    expect(problemsOf("Mock: Same\nDuration: 60\n\nSection: QA | 30\nQ00001\nSection: qa | 30\nQ00002")).toEqual([
      "Line 6: there is already a section called “QA”, on line 4. Each section needs its own name.",
    ]);
  });

  it("refuses more sections than the builder itself allows", () => {
    const body = Array.from({ length: 11 }, (_, index) => `Section: S${index} | 10\nQ${index + 1}`).join("\n");
    expect(problemsOf(`Mock: Many\nDuration: 110\n\n${body}`)).toEqual([
      "A mock holds at most 10 sections; this document has 11.",
    ]);
  });

  it("refuses minutes that are not a number", () => {
    expect(problemsOf("Mock: Bad minutes\nDuration: 60\n\nSection: QA | forty\nQ00001")).toEqual([
      "Line 4: “forty” is not a number of minutes. Write the section as “Section: VARC | 40”.",
    ]);
  });
});

describe("settings", () => {
  it("defaults what the document does not say, matching the builder's own defaults", () => {
    const { spec } = parseMockDocument("Mock: Bare\nDuration: 30\n\nSection: All\nQ00001");
    expect(spec).toMatchObject({
      allowMobile: true,
      maxAttempts: 1,
      negativeMarking: 0,
      negativeMarkingTypes: [],
      proctoringEnabled: false,
      proctoringStated: false,
    });
  });

  it("takes the real-CAT default types when a penalty names none", () => {
    const { spec } = parseMockDocument("Mock: Default types\nDuration: 30\nNegative marking: 0.33\n\nSection: All\nQ00001");
    expect(spec?.negativeMarking).toBe(0.33);
    expect(spec?.negativeMarkingTypes).toEqual(["mcq", "mcq_multi"]);
  });

  it("reads the Client's own word for a numerical answer", () => {
    const { spec } = parseMockDocument("Mock: Tita\nDuration: 30\nNegative marking: 1 on mcq and tita\n\nSection: All\nQ00001");
    expect(spec?.negativeMarkingTypes).toEqual(["mcq", "numerical"]);
  });

  it("reads none, and stores no types with no penalty, as the database requires", () => {
    for (const written of ["0", "none", "None", "off"]) {
      const { spec } = parseMockDocument(`Mock: No penalty\nDuration: 30\nNegative marking: ${written}\n\nSection: All\nQ00001`);
      expect(spec?.negativeMarking).toBe(0);
      expect(spec?.negativeMarkingTypes).toEqual([]);
    }
  });

  it("refuses a question type it does not know", () => {
    expect(problemsOf("Mock: Bad type\nDuration: 30\nNegative marking: 1 on essay\n\nSection: All\nQ00001")[0]).toContain(
      "“essay” is not a question type",
    );
  });

  it("refuses yes/no answers that are neither", () => {
    expect(problemsOf("Mock: Maybe\nDuration: 30\nAllow mobile: maybe\n\nSection: All\nQ00001")).toEqual([
      "Line 3: “maybe” is not yes or no.",
    ]);
  });

  it("refuses an attempt limit outside the builder's own range", () => {
    expect(problemsOf("Mock: Attempts\nDuration: 30\nAttempts: 0\n\nSection: All\nQ00001")[0]).toContain(
      "is not an attempt limit",
    );
    expect(problemsOf("Mock: Attempts\nDuration: 30\nAttempts: 101\n\nSection: All\nQ00001")[0]).toContain(
      "is not an attempt limit",
    );
  });

  it("refuses a duration outside the builder's own range", () => {
    expect(problemsOf("Mock: Long\nDuration: 1441\n\nSection: All\nQ00001")[0]).toContain("is not a duration");
  });

  it("refuses a setting it does not understand rather than ignoring it", () => {
    expect(problemsOf("Mock: Unknown\nDuration: 30\nShuffle: yes\n\nSection: All\nQ00001")[0]).toContain(
      "“Shuffle” is not a setting this template understands",
    );
  });

  it("refuses a setting written below the first section, where it would be missed", () => {
    expect(problemsOf("Mock: Late\nDuration: 30\n\nSection: All\nQ00001\nAttempts: 2")).toEqual([
      "Line 6: “Attempts” belongs above the first Section line.",
    ]);
  });

  it("refuses a setting given twice rather than letting one win silently", () => {
    expect(problemsOf("Mock: One\nMock: Two\nDuration: 30\n\nSection: All\nQ00001")).toEqual([
      "Line 2: the mock already has a title.",
    ]);
  });

  it("refuses a document with no title and no duration, naming both", () => {
    expect(problemsOf("Section: All\nQ00001")).toEqual([
      "Add a “Mock:” line naming the mock.",
      "Add a “Duration:” line in whole minutes.",
    ]);
  });

  it("refuses an empty paste", () => {
    expect(problemsOf("   \n\n")).toEqual(["Paste the mock document first."]);
  });
});

describe("layout a Google Doc paste actually carries", () => {
  it("ignores blank lines and rules of dashes", () => {
    const { problems, spec } = parseMockDocument(
      "Mock: Pasted\nDuration: 30\n-----\n\n\nSection: All\n\nQ00001\n\nQ00002\n===\n",
    );
    expect(problems).toEqual([]);
    expect(spec?.sections[0].refs.map((ref) => ref.id)).toEqual([1, 2]);
  });

  it("reads labels however they are cased and spaced", () => {
    const { problems, spec } = parseMockDocument("MOCK :  Cased\n  duration:30\nallow mobile :YES\n\nSECTION: All\nQ00001");
    expect(problems).toEqual([]);
    expect(spec).toMatchObject({ allowMobile: true, durationMinutes: 30, title: "Cased" });
  });
});
