import { describe, expect, it } from "vitest";

import { extractJsonBlock, maxRoundsPerImport, parseImportedProcess } from "./import-spec";

// The Client's real Masters' Union process, cut down to what matters here:
// three rounds, one of them a form with pages, one an aptitude test with no
// engine behind it, one happening off the platform entirely.
const mastersUnion = JSON.stringify({
  programme: "Masters' Union - ARS",
  rounds: [
    {
      name: "Application",
      type: "form",
      instructions: "Complete every section. You can save and come back.",
      due: "2026-10-15",
      mentorReviews: false,
      pages: [
        {
          title: "Personal details",
          sections: [
            {
              title: "About you",
              questions: [
                { label: "Full name", type: "short_text", prefill: "name" },
                { label: "Gender", type: "select", options: ["Female", "Male", "Prefer not to say"] },
              ],
            },
          ],
        },
        {
          title: "Your essay",
          sections: [{ questions: [{ label: "Why this programme?", type: "long_text", wordLimit: 200 }] }],
        },
      ],
    },
    {
      name: "Aptitude Test",
      type: "test",
      instructions: "A timed aptitude test.",
      test: {
        sections: ["Quantitative Ability", "Logical Reasoning"],
        questionCount: 45,
        durationMinutes: 120,
        negativeMarking: false,
      },
    },
    {
      name: "Interview and Group Discussion",
      type: "interview",
      instructions: "A panel interview followed by a group discussion.",
    },
  ],
});

describe("extractJsonBlock", () => {
  it("takes the JSON out of a fenced block", () => {
    const pasted = 'Here you go:\n\n```json\n{"rounds": []}\n```\n\nLet me know!';
    expect(extractJsonBlock(pasted)).toBe('{"rounds": []}');
  });

  it("takes the JSON out of unfenced prose", () => {
    const pasted = 'Sure! Here is the process:\n{"rounds": []}\nHope that helps.';
    expect(extractJsonBlock(pasted)).toBe('{"rounds": []}');
  });

  // A brace inside a question's label would end a naive brace scan in the wrong
  // place, truncating the object and producing "invalid JSON" for a paste that
  // was perfectly good.
  it("is not fooled by braces inside strings", () => {
    const pasted = '{"label": "Use {curly} braces", "done": true}';
    expect(extractJsonBlock(pasted)).toBe(pasted);
  });

  it("is not fooled by an escaped quote before a brace", () => {
    const pasted = '{"label": "a \\" then }", "done": true}';
    expect(extractJsonBlock(pasted)).toBe(pasted);
  });

  it("returns null when there is no object at all", () => {
    expect(extractJsonBlock("I could not read that document, sorry.")).toBeNull();
  });
});

describe("parseImportedProcess", () => {
  it("reads a real three-round process", () => {
    const { problems, programmeName, rounds } = parseImportedProcess(mastersUnion);

    expect(problems).toEqual([]);
    expect(programmeName).toBe("Masters' Union - ARS");
    expect(rounds).toHaveLength(3);
    expect(rounds.map((round) => round.submissionMode)).toEqual(["form", "offline", "offline"]);
  });

  it("keeps the rounds in the order the document gave them", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    expect(rounds.map((round) => round.name)).toEqual([
      "Application",
      "Aptitude Test",
      "Interview and Group Discussion",
    ]);
  });

  it("builds a form whose keys are ours, not the model's", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    const application = rounds[0];

    expect(application.fieldCount).toBe(3);
    expect(application.spec?.steps.map((step) => step.title)).toEqual([
      "Personal details",
      "Your essay",
    ]);
    expect(application.spec?.steps[0].sections[0].fields.map((field) => field.key)).toEqual([
      "full_name",
      "gender",
    ]);
    expect(application.spec?.steps[0].sections[0].fields[0].prefill).toBe("name");
    expect(application.spec?.steps[1].sections[0].fields[0].wordLimit).toBe(200);
  });

  // The failure this prevents is two questions silently overwriting one
  // another's answer, which is invisible until a student's submission is read.
  it("gives two identically-labelled questions different keys", () => {
    const { rounds } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            type: "form",
            instructions: "Fill this in.",
            pages: [
              {
                title: "Schooling",
                questions: [
                  { label: "Institution", type: "short_text" },
                  { label: "Institution", type: "short_text" },
                ],
              },
            ],
          },
        ],
      }),
    );

    const keys = rounds[0].spec?.steps[0].sections[0].fields.map((field) => field.key);
    expect(keys).toEqual(["institution", "institution_2"]);
  });

  it("captures an aptitude test as a placeholder rather than pretending to deliver it", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    const test = rounds[1];

    expect(test.pending).toBe(true);
    expect(test.submissionMode).toBe("offline");
    expect(test.config.pendingFeature).toBe("test-engine");
    expect(test.config.test).toMatchObject({ questionCount: 45, durationMinutes: 120 });
    expect(String(test.config.prompt)).toContain("45 questions");
    expect(test.notes.join(" ")).toContain("test engine is not built");
  });

  it("accepts the words a model actually uses instead of the ones we asked for", () => {
    const { problems, rounds } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            title: "Video Essay",
            kind: "video essay submission",
            description: "Record two minutes about yourself.",
            deadline: "2026-11-01",
          },
          {
            title: "Written Task",
            kind: "email writing",
            description: "Write the email described below.",
            fields: [{ question: "Your email", fieldType: "paragraph" }],
          },
        ],
      }),
    );

    expect(problems).toEqual([]);
    expect(rounds[0].submissionMode).toBe("file");
    expect(rounds[1].submissionMode).toBe("text");
    // A text round takes one answer, so questions given alongside it are
    // reported rather than silently dropped.
    expect(rounds[1].notes.join(" ")).toContain("left out");
  });

  it("reads questions hung straight off a page, with no section", () => {
    const { problems, rounds } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            type: "form",
            instructions: "Fill this in.",
            pages: [{ title: "About you", questions: [{ label: "Full name", type: "text" }] }],
          },
        ],
      }),
    );

    expect(problems).toEqual([]);
    expect(rounds[0].fieldCount).toBe(1);
  });

  it("treats a round carrying pages but no type as a form", () => {
    const { rounds } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            instructions: "Fill this in.",
            pages: [{ title: "About you", questions: [{ label: "Full name" }] }],
          },
        ],
      }),
    );

    expect(rounds[0].submissionMode).toBe("form");
    // An untyped question is the one guess worth making, and the preview shows
    // it before a student ever sees it.
    expect(rounds[0].spec?.steps[0].sections[0].fields[0].type).toBe("short_text");
  });

  it("stores a deadline as the end of that day in IST", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    // 2026-10-15 23:59:59 +05:30 is 18:29:59Z the same day. A deadline stored as
    // the start of the day would quietly cost a student their last 24 hours.
    expect(rounds[0].dueAt).toBe("2026-10-15T18:29:59.000Z");
    expect(rounds[0].opensAt).toBeNull();
  });

  it("says so when the document carried no dates", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    expect(rounds[2].notes.join(" ")).toContain("No dates");
  });

  it("refuses an invented date it cannot read", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [{ name: "Application", type: "text", instructions: "Write.", due: "mid-October" }],
      }),
    );
    expect(problems.join(" ")).toContain("2026-10-15");
  });

  it("refuses a deadline that falls before the opening date", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            type: "text",
            instructions: "Write.",
            opens: "2026-11-01",
            due: "2026-10-01",
          },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("before the opening date");
  });

  // This one matters more than it looks: the database would refuse the second
  // round for a duplicate name AFTER the existing process had been deleted.
  it("refuses two rounds sharing a name, before anything is destroyed", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          { name: "Interview", type: "interview", instructions: "One." },
          { name: "interview", type: "interview", instructions: "Two." },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("Names must differ");
  });

  it("refuses a question type it cannot render rather than guessing", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            type: "form",
            instructions: "Fill this in.",
            pages: [{ title: "About", questions: [{ label: "Signature", type: "signature_pad" }] }],
          },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("signature_pad");
  });

  it("refuses a dropdown with nothing to choose from", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          {
            name: "Application",
            type: "form",
            instructions: "Fill this in.",
            pages: [{ title: "About", questions: [{ label: "City", type: "select" }] }],
          },
        ],
      }),
    );
    expect(problems.join(" ")).toContain("at least one option");
  });

  it("reports every problem at once rather than the first", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          { type: "text", instructions: "No name here." },
          { name: "Second", type: "text" },
        ],
      }),
    );
    expect(problems.length).toBeGreaterThan(1);
  });

  it("refuses a round with no instructions for the student", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({ rounds: [{ name: "Application", type: "text" }] }),
    );
    expect(problems.join(" ")).toContain("instructions");
  });

  it("refuses a form round with no questions in it", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({ rounds: [{ name: "Application", type: "form", instructions: "Fill this in." }] }),
    );
    expect(problems.join(" ")).toContain("at least one question");
  });

  it("refuses more rounds than an import takes", () => {
    const { problems } = parseImportedProcess(
      JSON.stringify({
        rounds: Array.from({ length: maxRoundsPerImport + 1 }, (_, index) => ({
          name: `Round ${index}`,
          type: "interview",
          instructions: "Something.",
        })),
      }),
    );
    expect(problems.join(" ")).toContain(`at most ${maxRoundsPerImport}`);
  });

  it("tells an admin who pasted the wrong thing what they pasted", () => {
    expect(parseImportedProcess("You are reading an admission-process document").problems.join(" ")).toContain(
      "no JSON",
    );
    expect(parseImportedProcess('{"rounds": [').problems.join(" ")).toContain("not valid JSON");
    expect(parseImportedProcess('{"programme": "X"}').problems.join(" ")).toContain("No rounds");
  });

  // Nothing reaches the database on a failed paste, including the half of it
  // that parsed cleanly.
  it("returns no rounds at all when any round failed", () => {
    const { rounds } = parseImportedProcess(
      JSON.stringify({
        rounds: [
          { name: "Good", type: "text", instructions: "Fine." },
          { name: "Bad", type: "form", instructions: "No questions." },
        ],
      }),
    );
    expect(rounds).toEqual([]);
  });

  it("defaults mentor review on for everything except an application form", () => {
    const { rounds } = parseImportedProcess(mastersUnion);
    expect(rounds[0].requiresReview).toBe(false);
    expect(rounds[1].requiresReview).toBe(true);
    expect(rounds[2].requiresReview).toBe(true);
  });
});
