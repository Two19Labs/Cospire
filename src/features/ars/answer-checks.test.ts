import { describe, expect, it } from "vitest";

import { checkResult, normalisePhone, readAnswer } from "./answer-checks";
import { sectionShown, validateFormSpec, type FormField } from "./form-schema";
import { parseImportedProcess } from "./import-spec";

const post = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("answer checks", () => {
  it("reads an Indian mobile number in the ways people write one", () => {
    for (const raw of ["9876543210", "+91 98765 43210", "919876543210", "09876543210", "98765-43210"]) {
      expect(normalisePhone(raw)).toBe("9876543210");
    }
    for (const raw of ["5876543210", "987654321", "98765432101", "abcdefghij"]) {
      expect(normalisePhone(raw)).toBeNull();
    }
  });

  it("checks a result against its marking scheme", () => {
    expect(checkResult("Percentage", "92.4")).toBe("92.4");
    expect(checkResult("Percentage", "100")).toBe("100");
    expect(checkResult("Percentage", "100.5")).toBeNull();
    expect(checkResult("CGPA", "9.8")).toBe("9.8");
    expect(checkResult("CGPA", "10.2")).toBeNull();
    expect(checkResult("Grades", "a1")).toBe("A1");
    expect(checkResult("Grades", "92")).toBeNull();
    expect(checkResult("", "anything")).toBe("anything");
  });

  it("applies format, range and date rules to posted answers", () => {
    const phone: FormField = { format: "phone", key: "p", label: "P", type: "short_text" };
    expect(readAnswer(post({ p: "+91 98765 43210" }), phone)).toEqual({ value: "9876543210" });
    expect(readAnswer(post({ p: "12345" }), phone)).toEqual({ error: "bad-phone" });

    const email: FormField = { format: "email", key: "e", label: "E", type: "short_text" };
    expect(readAnswer(post({ e: "Parent@Example.com" }), email)).toEqual({ value: "parent@example.com" });
    expect(readAnswer(post({ e: "not an email" }), email)).toEqual({ error: "bad-email" });

    const year: FormField = { key: "y", label: "Y", max: 2030, min: 2024, type: "month_year" };
    expect(readAnswer(post({ y: "2025-03" }), year)).toEqual({ value: "2025-03" });
    expect(readAnswer(post({ y: "2023-03" }), year)).toEqual({ error: "out-of-range" });
    expect(readAnswer(post({ y: "2025-13" }), year)).toEqual({ error: "bad-month" });

    const dob: FormField = { key: "d", label: "D", pastOnly: true, type: "date" };
    const now = new Date("2026-11-07T00:00:00Z");
    expect(readAnswer(post({ d: "2008-05-01" }), dob, now)).toEqual({ value: "2008-05-01" });
    expect(readAnswer(post({ d: "2026-12-01" }), dob, now)).toEqual({ error: "future-date" });

    const result: FormField = { key: "r", label: "R", scoredBy: "s", type: "short_text" };
    expect(readAnswer(post({ r: "11", s: "CGPA" }), result)).toEqual({ error: "bad-result" });
    expect(readAnswer(post({ r: "8.2", s: "CGPA" }), result)).toEqual({ value: "8.2" });
  });
});

describe("conditional sections", () => {
  const mu = JSON.stringify({
    rounds: [
      {
        name: "Application",
        prompt: "Fill in your application.",
        pages: [
          {
            title: "Academic Details",
            sections: [
              {
                title: "Class 12th Results",
                questions: [
                  { label: "Are your grade 12th results out?", options: ["Yes", "No"], required: false, type: "radio" },
                ],
              },
              {
                showWhen: { equals: "Yes", field: "Are your grade 12th results out?" },
                questions: [
                  { label: "Marking Scheme", options: ["Percentage", "CGPA", "Grades"], type: "select" },
                  { label: "Result", scoredBy: "Marking Scheme", type: "short_text" },
                ],
              },
              {
                showWhen: { field: "Are your grade 12th results out?", notEquals: "Yes" },
                questions: [{ label: "Expected Year of Passing", max: 2030, min: 2024, required: false, type: "month_year" }],
              },
              { description: "Applicants must have finished 12th in 2024 or later." },
            ],
          },
        ],
      },
    ],
  });

  it("imports conditions, results and notes as a valid form", () => {
    const { problems, rounds } = parseImportedProcess(mu);
    expect(problems).toEqual([]);
    const spec = rounds[0].spec!;
    expect(validateFormSpec(spec)).toEqual([]);

    const [question, yes, no, note] = spec.steps[0].sections;
    const controller = question.fields[0].key;
    expect(yes.showWhen).toEqual({ equals: "Yes", field: controller });
    expect(yes.fields[1].scoredBy).toBe(yes.fields[0].key);
    expect(no.fields[0]).toMatchObject({ max: 2030, min: 2024 });
    expect(note.fields).toEqual([]);

    // Unanswered behaves like the portal's default of No.
    expect(sectionShown(yes, {})).toBe(false);
    expect(sectionShown(no, {})).toBe(true);
    expect(sectionShown(yes, { [controller]: "Yes" })).toBe(true);
    expect(sectionShown(no, { [controller]: "Yes" })).toBe(false);
  });

  it("refuses a condition on a question that is not earlier on the page", () => {
    const problems = validateFormSpec({
      steps: [
        {
          key: "one",
          sections: [{ fields: [{ key: "a", label: "A", type: "short_text" }], showWhen: { equals: "x", field: "a" } }],
          title: "One",
        },
      ],
    });
    expect(problems.map((entry) => entry.message)).toContain(
      'showWhen refers to "a", which is not earlier on this page.',
    );
  });
});
