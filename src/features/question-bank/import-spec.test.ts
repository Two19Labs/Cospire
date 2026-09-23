import { describe, expect, it } from "vitest";

import { buildQuestionImportPrompt } from "./import-prompt";
import { parseImportedQuestions } from "./import-spec";

function paste(questions: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ questions, ...extra });
}

const base = { difficulty: "medium", marks: 3, section: "QA", topic: "Percentages" };

describe("parseImportedQuestions", () => {
  it("reads the prompt's own example without a single problem", () => {
    const prompt = buildQuestionImportPrompt();
    const example = prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1);
    const { items, problems, documentName } = parseImportedQuestions(example);

    expect(problems).toEqual([]);
    expect(documentName).toBe("QA practice set 4");
    expect(items.map((item) => item.parsed?.type)).toEqual(["mcq", "numerical", "di_stimulus", "numerical", "mcq"]);
    expect(items.every((item) => item.problems.length === 0)).toBe(true);
    expect(items[0].parsed?.correctOptions).toEqual([0]);
    expect(items[3].parsed).toMatchObject({ parentPosition: 2, sectionName: "DILR", topic: "Tables" });
    // The example's DI passage carries [[figure:3]]. The prompt and the parser
    // are checked against each other here on purpose: a marker shape changed in
    // one and not the other would leave every imported figure unattached, and
    // nothing else would notice.
    expect(items[2].parsed?.figures).toEqual([3]);
    expect(items[2].parsed?.notes).toEqual([]);
    expect(items[2].parsed?.body).not.toMatch(/\[\[/);
  });

  describe("figure markers", () => {
    it("records a numbered marker against the question and takes it out of the text", () => {
      const { items } = parseImportedQuestions(
        paste([{ ...base, answer: "1", question: "Study [[figure:2]] and answer.", type: "tita" }]),
      );
      expect(items[0].parsed?.figures).toEqual([2]);
      expect(items[0].parsed?.body).toBe("Study and answer.");
      // A number is resolved to an image at staging, so there is nothing for the
      // admin to do and nothing to tell them.
      expect(items[0].parsed?.notes).toEqual([]);
    });

    it("keeps an unnumbered marker as the note it has always been", () => {
      const { items } = parseImportedQuestions(
        paste([{ ...base, answer: "1", question: "Study [[figure]] and answer.", type: "tita" }]),
      );
      expect(items[0].parsed?.figures).toEqual([]);
      expect(items[0].parsed?.notes.join(" ")).toMatch(/Paste or upload it before approving/);
    });

    it("reads every spelling of a marker the prompt or a model might produce", () => {
      const { items } = parseImportedQuestions(
        paste([
          { ...base, answer: "1", question: "[[figure:1]] [[Figure: 2]] [[image 3]] [[fig:4]] [[chart:5]]", type: "tita" },
        ]),
      );
      expect(items[0].parsed?.figures).toEqual([1, 2, 3, 4, 5]);
      expect(items[0].parsed?.body).toBe("");
    });

    it("counts one figure once however often a question names it", () => {
      const { items } = parseImportedQuestions(
        paste([{ ...base, answer: "1", question: "[[figure:2]] and again [[figure:2]]", type: "tita" }]),
      );
      expect(items[0].parsed?.figures).toEqual([2]);
    });

    it("keeps a figure that sits inside an option, and still flags the option", () => {
      const { items } = parseImportedQuestions(
        paste([{ ...base, answer: "A", options: ["[[figure:4]]", "none of these"], question: "Which shape?" }]),
      );
      expect(items[0].parsed?.figures).toEqual([4]);
      expect(items[0].parsed?.options).toEqual(["", "none of these"]);
      expect(items[0].parsed?.notes.join(" ")).toMatch(/An option contains figure 4.*retype the option/);
    });

    it("reads a question that is nothing but a figure", () => {
      const { items } = parseImportedQuestions(
        paste([{ ...base, answer: "7", question: "[[figure:1]]", type: "tita" }]),
      );
      expect(items[0].parsed?.body).toBe("");
      expect(items[0].parsed?.figures).toEqual([1]);
      expect(items[0].problems).toEqual([]);
    });

    it("carries a set's figure on the set, not on its sub-questions", () => {
      const { items } = parseImportedQuestions(
        paste([
          {
            ...base,
            passage: "The table below. [[figure:9]]",
            questions: [{ answer: "4", marks: 3, question: "Total?", type: "tita" }],
            type: "di_set",
          },
        ]),
      );
      expect(items[0].parsed?.figures).toEqual([9]);
      expect(items[1].parsed?.figures).toEqual([]);
      expect(items[1].parsed?.parentPosition).toBe(0);
    });
  });

  it("takes the JSON out of prose and code fences", () => {
    const wrapped = `Here are the questions:\n\`\`\`json\n${paste([{ ...base, answer: "b", options: ["1", "2"], question: "Q" }])}\n\`\`\`\nLet me know!`;
    expect(parseImportedQuestions(wrapped).items).toHaveLength(1);
  });

  it("accepts a bare list", () => {
    expect(parseImportedQuestions(JSON.stringify([{ ...base, answer: "5", question: "Q" }])).items).toHaveLength(1);
  });

  it.each([
    ["B", 1],
    ["b", 1],
    ["(c)", 2],
    ["Option D", 3],
    ["15%", 1],
    ["2", 1],
  ])("reads the answer %j as option %i", (answer, index) => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, answer, options: ["12.5%", "15%", "10%", "12%"], question: "Q", type: "mcq" }]),
    );
    expect(items[0].parsed?.correctOptions).toEqual([index]);
    expect(items[0].problems).toEqual([]);
  });

  it("prefers an option's own text over its position", () => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, answer: "3", options: ["2", "3", "4"], question: "Q", type: "mcq" }]),
    );
    expect(items[0].parsed?.correctOptions).toEqual([1]);
  });

  it.each([["A, C"], ["A and C"], ["AC"], [["A", "C"]]])("reads %j as two answers", (answer) => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, answer, options: ["21", "23", "29"], question: "Q", type: "mcq_multi" }]),
    );
    expect(items[0].parsed?.correctOptions).toEqual([0, 2]);
  });

  it("promotes an MCQ with two answers to multiple correct, and says so", () => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, answer: ["A", "B"], options: ["x", "y", "z"], question: "Q", type: "mcq" }]),
    );
    expect(items[0].parsed?.type).toBe("mcq_multi");
    expect(items[0].parsed?.notes.join(" ")).toMatch(/multiple correct/);
  });

  it("stages a question whose answer matches no option, with the problem", () => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, answer: "E", options: ["a", "b"], question: "Q", type: "mcq" }]),
    );
    expect(items[0].parsed).not.toBeNull();
    expect(items[0].problems.join(" ")).toMatch(/does not match any option/);
  });

  it("stages a question with no answer and asks for one, rather than guessing", () => {
    const { items } = parseImportedQuestions(paste([{ ...base, options: ["a", "b"], question: "Q", type: "mcq" }]));
    expect(items[0].problems.join(" ")).toMatch(/no answer was given/);
  });

  it("reads typed answers from a number, a string, a list and an 'or'", () => {
    const read = (answer: unknown) =>
      parseImportedQuestions(paste([{ ...base, answer, question: "Q", type: "tita" }])).items[0].parsed?.accepted;
    expect(read(12)).toEqual(["12"]);
    expect(read("0.5")).toEqual(["0.5"]);
    expect(read(["0.5", "1/2"])).toEqual(["0.5", "1/2"]);
    expect(read("0.5 or 1/2")).toEqual(["0.5", "1/2"]);
  });

  it("flags a typed answer the checker cannot compare", () => {
    const { items } = parseImportedQuestions(paste([{ ...base, answer: "about 12", question: "Q", type: "tita" }]));
    expect(items[0].problems.join(" ")).toMatch(/not a number/);
  });

  it("infers the type from the shape when none is given", () => {
    const { items } = parseImportedQuestions(
      paste([
        { ...base, answer: "A", options: ["x", "y"], question: "With options" },
        { ...base, answer: "7", question: "Without" },
      ]),
    );
    expect(items.map((item) => item.parsed?.type)).toEqual(["mcq", "numerical"]);
  });

  it("maps difficulty synonyms and flags a missing one", () => {
    const read = (difficulty?: string) =>
      parseImportedQuestions(paste([{ ...base, answer: "1", difficulty, question: "Q", type: "tita" }])).items[0];
    expect(read("Moderate").parsed?.difficulty).toBe("medium");
    expect(read("tough").parsed?.difficulty).toBe("hard");
    expect(read(undefined).problems.join(" ")).toMatch(/no difficulty/);
  });

  it("does not guess marks", () => {
    const { items } = parseImportedQuestions(paste([{ ...base, answer: "1", marks: undefined, question: "Q", type: "tita" }]));
    expect(items[0].parsed?.marks).toBe("");
  });

  it("refuses an unknown type but still stages the entry for the record", () => {
    const { items } = parseImportedQuestions(paste([{ ...base, answer: "x", question: "Write an essay", type: "essay" }]));
    expect(items[0].parsed).toBeNull();
    expect(items[0].problems.join(" ")).toMatch(/"essay" is not a question type/);
  });

  it("gives a set's sub-questions the set's section, topic and difficulty unless they state their own", () => {
    const { items } = parseImportedQuestions(
      paste([
        {
          difficulty: "hard",
          passage: "Table",
          questions: [
            { answer: "1", question: "One", type: "tita" },
            { answer: "2", difficulty: "easy", question: "Two", topic: "Averages", type: "tita" },
          ],
          section: "DILR",
          topic: "Tables",
          type: "di_set",
        },
      ]),
    );
    expect(items[0].parsed).toMatchObject({ marks: "0", type: "di_stimulus" });
    expect(items[0].raw.questions).toBeUndefined();
    expect(items[1].parsed).toMatchObject({ difficulty: "hard", parentPosition: 0, sectionName: "DILR", topic: "Tables" });
    expect(items[2].parsed).toMatchObject({ difficulty: "easy", topic: "Averages" });
  });

  it("refuses a set inside a set", () => {
    const { items } = parseImportedQuestions(
      paste([{ ...base, passage: "P", questions: [{ passage: "Q", question: "x", type: "di_set" }], type: "di_set" }]),
    );
    expect(items[1].problems.join(" ")).toMatch(/cannot sit inside another set/);
  });

  it("refuses a paste with no JSON, a cut-off one, and one with no questions", () => {
    expect(parseImportedQuestions("Sorry, I cannot read that file.").problems[0]).toMatch(/no JSON/);
    expect(parseImportedQuestions('{"questions": [{"question": "Q"').problems[0]).toMatch(/cut off/);
    expect(parseImportedQuestions('{"questions": []}').problems[0]).toMatch(/No questions/);
  });

  it("refuses more questions than one import takes, counting sub-questions", () => {
    const many = Array.from({ length: 201 }, (_, index) => ({ ...base, answer: "1", question: `Q${index}` }));
    expect(parseImportedQuestions(paste(many)).problems[0]).toMatch(/at most 200/);
  });
});
