import { describe, expect, it } from "vitest";

import {
  buildNewQuestionHref,
  buildQuestionHref,
  buildQuestionsHref,
  normaliseSectionName,
  parseId,
  parseQuestionFilters,
  parseQuestionNotice,
  parseSectionError,
  questionBankBase,
  sanitizeQuestionSearch,
} from "./list-params";
import { readQuestionForm, storedToFormValues } from "./question-form";
import { validateQuestion } from "./question-input";
import { buildQuestionImagePath, describeImageRejection } from "./storage";

describe("questionBankBase", () => {
  it("is chosen by role and nothing else", () => {
    expect(questionBankBase("admin")).toBe("/admin/questions");
    expect(questionBankBase("mentor")).toBe("/mentor/questions");
    expect(questionBankBase("anything else")).toBe("/mentor/questions");
  });
});

describe("parseQuestionFilters", () => {
  it("reads every filter and ignores what it does not recognise", () => {
    expect(
      parseQuestionFilters({
        difficulty: "hard",
        page: "3",
        q: "ratio",
        section: "4",
        status: "archived",
        topic: " Percentages ",
        type: "numerical",
      }),
    ).toEqual({
      archived: true,
      difficulty: "hard",
      page: 3,
      search: "ratio",
      sectionId: 4,
      topic: "Percentages",
      type: "numerical",
    });
    expect(parseQuestionFilters({ difficulty: "brutal", section: "x", type: "essay" })).toMatchObject({
      difficulty: null,
      sectionId: null,
      type: null,
    });
  });

  it("neutralises PostgREST filter syntax in a search", () => {
    expect(sanitizeQuestionSearch("x,type.eq.mcq)")).toBe("x type.eq.mcq");
    expect(sanitizeQuestionSearch('50% "off"')).toBe("50 off");
  });
});

describe("hrefs", () => {
  it("round-trips filters through the list href", () => {
    const href = buildQuestionsHref("/admin/questions", { page: 2, sectionId: 4, topic: "Time & work" });
    expect(href).toBe("/admin/questions?section=4&topic=Time+%26+work&page=2");
  });

  it("builds question and new-question links", () => {
    expect(buildQuestionHref("/mentor/questions", 9, "saved")).toBe("/mentor/questions/9?notice=saved");
    expect(buildNewQuestionHref("/admin/questions", "mcq", 12)).toBe("/admin/questions/new?type=mcq&parent=12");
  });

  it("renders only known notices and errors", () => {
    expect(parseQuestionNotice("saved")).toBe("saved");
    expect(parseQuestionNotice("<img src=x>")).toBeNull();
    expect(parseSectionError("in-use")).toBe("in-use");
    expect(parseSectionError("__proto__")).toBeNull();
  });
});

describe("parseId and section names", () => {
  it.each(["0", "-1", "1.5", "abc", "", "1e3", "9999999999999999999"])("refuses %j", (raw) => {
    expect(parseId(raw)).toBeNull();
  });

  it("accepts a positive whole number", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId(42)).toBeNull();
  });

  it("normalises a section name and refuses a blank or long one", () => {
    expect(normaliseSectionName("  Data   Interpretation ")).toBe("Data Interpretation");
    expect(normaliseSectionName("   ")).toBeNull();
    expect(normaliseSectionName("x".repeat(61))).toBeNull();
  });
});

describe("readQuestionForm", () => {
  function post(fields: [string, string][]): FormData {
    const formData = new FormData();
    for (const [name, value] of fields) formData.append(name, value);
    return formData;
  }

  it("reads a single-correct MCQ exactly as the editor posts it", () => {
    const { draft, questionId } = readQuestionForm(
      post([
        ["type", "mcq"],
        ["questionId", "7"],
        ["sectionId", "3"],
        ["topic", "Algebra"],
        ["difficulty", "easy"],
        ["marks", "3"],
        ["body", "x + 2 = 5"],
        ["option-0", "2"],
        ["option-1", "3"],
        ["correct", "1"],
      ]),
    );
    expect(questionId).toBe(7);
    expect(draft.options.slice(0, 3)).toEqual(["2", "3", ""]);
    expect(draft.correctOptions).toEqual([1]);
    expect(validateQuestion(draft, 1).question?.correctAnswer).toEqual({ options: ["b"] });
  });

  it("drops a crafted correct-option index out of range", () => {
    const { draft } = readQuestionForm(post([["correct", "99"], ["correct", "-1"], ["correct", "a"]]));
    expect(draft.correctOptions).toEqual([]);
  });

  it("reads accepted numerical forms one per line", () => {
    const { draft } = readQuestionForm(post([["accepted", "0.5\r\n1/2\n"]]));
    expect(draft.accepted).toEqual(["0.5", "1/2", ""]);
  });

  it("round-trips a stored question back to the same draft", () => {
    const values = storedToFormValues({
      body: "Pick two",
      correctAnswer: { options: ["a", "c"] },
      difficulty: "medium",
      images: [],
      marks: 2,
      options: [
        { id: "a", text: "one" },
        { id: "b", text: "two" },
        { id: "c", text: "three" },
      ],
      sectionId: 4,
      solution: null,
      topic: "Sets",
    });
    expect(values).toMatchObject({ correctOptions: [0, 2], marks: "2", options: ["one", "two", "three"], sectionId: "4" });

    const numerical = storedToFormValues({
      body: "Half?",
      correctAnswer: { accepted: ["0.5", "1/2"], tolerance: 0.01 },
      difficulty: "easy",
      images: [],
      marks: 3,
      options: [],
      sectionId: 4,
      solution: "Divide.",
      topic: "Fractions",
    });
    expect(numerical).toMatchObject({ accepted: "0.5\n1/2", solution: "Divide.", tolerance: "0.01" });
  });
});

describe("question image paths", () => {
  it("builds a path the database and bucket policy both accept", () => {
    const path = buildQuestionImagePath({
      objectId: "0f8fad5b-d9cb-469f-a165-70867728950e",
      orgId: 1,
      type: "image/png",
    });
    expect(path).toBe("org/1/questions/0f8fad5b-d9cb-469f-a165-70867728950e.png");
    expect(validateQuestion({
      accepted: [], body: "Q", correctOptions: [0], difficulty: "easy", images: [path], marks: "1",
      options: ["a", "b"], parentId: null, sectionId: 1, solution: "", tolerance: "", topic: "T", type: "mcq",
    }, 1).question?.images).toEqual([path]);
  });

  it("refuses an unsupported type, a bad id and a large file", () => {
    expect(() => buildQuestionImagePath({ objectId: "x", orgId: 1, type: "image/png" })).toThrow();
    expect(() => buildQuestionImagePath({ objectId: "0f8fad5b-d9cb-469f-a165-70867728950e", orgId: 1, type: "image/svg+xml" })).toThrow();
    expect(describeImageRejection({ size: 10, type: "image/svg+xml" })).toMatch(/PNG/);
    expect(describeImageRejection({ size: 6 * 1024 * 1024, type: "image/png" })).toMatch(/5 MB/);
    expect(describeImageRejection({ size: 10, type: "image/jpeg" })).toBeNull();
  });
});
