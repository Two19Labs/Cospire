import { describe, expect, it } from "vitest";

import { toSaveQuestionArgs, validateQuestion, type QuestionDraft } from "./question-input";

const image = "org/1/questions/0f8fad5b-d9cb-469f-a165-70867728950e.png";

function draft(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    accepted: [],
    body: "If x + 2 = 5, what is x?",
    correctOptions: [1],
    difficulty: "easy",
    images: [],
    marks: "3",
    options: ["2", "3", "4", "5"],
    parentId: null,
    sectionId: 7,
    solution: "  Subtract 2.  ",
    tolerance: "",
    topic: "  Linear   equations ",
    type: "mcq",
    ...overrides,
  };
}

describe("validateQuestion", () => {
  it("accepts a single-correct MCQ and assigns option ids by position", () => {
    const { problems, question } = validateQuestion(draft(), 1);
    expect(problems).toEqual([]);
    expect(question).toMatchObject({
      correctAnswer: { options: ["b"] },
      marks: 3,
      options: [
        { id: "a", text: "2" },
        { id: "b", text: "3" },
        { id: "c", text: "4" },
        { id: "d", text: "5" },
      ],
      solution: "Subtract 2.",
      topic: "Linear equations",
    });
  });

  it("skips blank option rows and keeps the key pointing at the right option", () => {
    const { question } = validateQuestion(draft({ correctOptions: [3], options: ["2", "", "4", "5"] }), 1);
    expect(question?.options.map((option) => option.id)).toEqual(["a", "b", "c"]);
    expect(question?.correctAnswer).toEqual({ options: ["c"] });
  });

  it("refuses a single-correct MCQ with two answers or none", () => {
    expect(validateQuestion(draft({ correctOptions: [0, 1] }), 1).problems).toContain("Mark exactly one option as correct.");
    expect(validateQuestion(draft({ correctOptions: [] }), 1).problems).toContain("Mark exactly one option as correct.");
  });

  it("refuses a key that points only at a blank row", () => {
    const { problems } = validateQuestion(draft({ correctOptions: [1], options: ["2", "", "4"] }), 1);
    expect(problems).toContain("Mark exactly one option as correct.");
  });

  it("accepts a multiple-correct MCQ with several answers", () => {
    const { question } = validateQuestion(draft({ correctOptions: [0, 2], type: "mcq_multi" }), 1);
    expect(question?.correctAnswer).toEqual({ options: ["a", "c"] });
  });

  it("needs at least two options", () => {
    expect(validateQuestion(draft({ correctOptions: [0], options: ["only", ""] }), 1).problems).toContain(
      "Give at least 2 options.",
    );
  });

  it("refuses every missing tag at once", () => {
    const { problems, question } = validateQuestion(
      draft({ difficulty: "", marks: "", sectionId: null, topic: "   " }),
      1,
    );
    expect(question).toBeNull();
    expect(problems).toEqual(
      expect.arrayContaining([
        "Choose a section.",
        "Give the question a topic.",
        "Choose a difficulty.",
        "Marks must be a number above 0 and at most 100, with up to two decimals.",
      ]),
    );
  });

  it.each(["0", "-1", "abc", "2.555", "101"])("refuses %j as marks", (marks) => {
    expect(validateQuestion(draft({ marks }), 1).question).toBeNull();
  });

  it("accepts half marks", () => {
    expect(validateQuestion(draft({ marks: "2.5" }), 1).question?.marks).toBe(2.5);
  });

  it("accepts a typed answer with several forms and a tolerance", () => {
    const { question } = validateQuestion(
      draft({ accepted: ["0.5", " 1/2 ", "0.5", ""], correctOptions: [], options: [], tolerance: "0.01", type: "numerical" }),
      1,
    );
    expect(question?.options).toEqual([]);
    expect(question?.correctAnswer).toEqual({ accepted: ["0.5", "1/2"], tolerance: 0.01 });
  });

  it("refuses a typed answer form the answer box cannot compare", () => {
    const { problems } = validateQuestion(draft({ accepted: ["half"], type: "numerical" }), 1);
    expect(problems.some((problem) => problem.includes('"half"'))).toBe(true);
  });

  it("gives a DI stimulus zero marks, no key and no solution", () => {
    const { question } = validateQuestion(draft({ marks: "5", type: "di_stimulus" }), 1);
    expect(question).toMatchObject({ correctAnswer: null, marks: 0, options: [], solution: null });
  });

  it("refuses a DI stimulus inside another set", () => {
    expect(validateQuestion(draft({ parentId: 4, type: "di_stimulus" }), 1).question).toBeNull();
  });

  it("accepts an image in its own organisation and refuses one elsewhere", () => {
    expect(validateQuestion(draft({ images: [image] }), 1).question?.images).toEqual([image]);
    expect(validateQuestion(draft({ images: [image] }), 5).question).toBeNull();
    expect(validateQuestion(draft({ images: ["../../etc/passwd"] }), 1).question).toBeNull();
  });

  it("refuses an unknown question type", () => {
    expect(validateQuestion(draft({ type: "essay" }), 1).problems).toContain("Choose a question type.");
  });

  it("keeps line breaks and Unicode notation in the body", () => {
    const body = "Find x.\n\nx² + ½ = √9";
    expect(validateQuestion(draft({ body: body.replace(/\n/g, "\r\n") }), 1).question?.body).toBe(body);
  });
});

describe("toSaveQuestionArgs", () => {
  it("names every save_question parameter", () => {
    const { question } = validateQuestion(draft(), 1);
    expect(Object.keys(toSaveQuestionArgs(question!, null)).sort()).toEqual([
      "p_body",
      "p_correct_answer",
      "p_difficulty",
      "p_images",
      "p_marks",
      "p_options",
      "p_parent_id",
      "p_question_id",
      "p_section_id",
      "p_solution",
      "p_topic",
      "p_type",
    ]);
  });
});
