import { describe, expect, it } from "vitest";

import {
  buildRoundsHref,
  parseRoundError,
  parseRoundId,
  parseRoundNotice,
} from "./list-params";
import {
  parseFieldLabels,
  roundFieldLabelMaxLength,
  roundMaxFields,
  roundNameMaxLength,
  roundPromptMaxLength,
  validateNewRound,
} from "./round-input";

const valid = {
  fields: "",
  name: "Mock application",
  prompt: "Answer as you would for the real thing.",
  submissionMode: "text",
};

describe("validateNewRound", () => {
  it("accepts a text round and trims what it keeps", () => {
    const { errors, value } = validateNewRound({
      ...valid,
      name: "  Guesstimate  ",
      prompt: "  Estimate the number of taxis in Mumbai.  ",
    });

    expect(errors).toEqual({});
    expect(value).toEqual({
      config: { prompt: "Estimate the number of taxis in Mumbai." },
      name: "Guesstimate",
      submissionMode: "text",
    });
  });

  // `fields` is written only for `form`. Carrying an empty array on the other
  // modes would suggest the shape supports questions when nothing reads them.
  it("writes no fields key for text or file rounds, even when questions are typed", () => {
    for (const submissionMode of ["text", "file"]) {
      const { value } = validateNewRound({
        ...valid,
        fields: "Why this school?",
        submissionMode,
      });

      expect(value?.config).toEqual({ prompt: valid.prompt });
      expect(value?.config.fields).toBeUndefined();
    }
  });

  it("builds the field list for a form round", () => {
    const { value } = validateNewRound({
      ...valid,
      fields: "Why this school?\n  What will you contribute?  \n\n",
      submissionMode: "form",
    });

    expect(value?.config.fields).toEqual([
      { label: "Why this school?" },
      { label: "What will you contribute?" },
    ]);
  });

  // This is the case the database check constraint originally let through: a
  // form round carrying a prompt and no fields at all. The constraint is fixed;
  // the validation must refuse it before the row is ever attempted.
  it("refuses a form round with no questions", () => {
    const { errors, value } = validateNewRound({
      ...valid,
      fields: "   \n  \n",
      submissionMode: "form",
    });

    expect(value).toBeNull();
    expect(errors.fields).toContain("at least one question");
  });

  it("refuses duplicate questions, which would collide in the answer", () => {
    const { errors, value } = validateNewRound({
      ...valid,
      fields: "Why this school?\nWhy this school?",
      submissionMode: "form",
    });

    expect(value).toBeNull();
    expect(errors.fields).toBe("Each question must be different.");
  });

  it("refuses more questions than the cap", () => {
    const { value } = validateNewRound({
      ...valid,
      fields: Array.from({ length: roundMaxFields + 1 }, (_, i) => `Q${i}`).join("\n"),
      submissionMode: "form",
    });

    expect(value).toBeNull();
  });

  it("refuses a question longer than the column allows", () => {
    const { value } = validateNewRound({
      ...valid,
      fields: "a".repeat(roundFieldLabelMaxLength + 1),
      submissionMode: "form",
    });

    expect(value).toBeNull();
  });

  it("refuses a blank name and an over-long one", () => {
    expect(validateNewRound({ ...valid, name: "   " }).errors.name).toBe(
      "Give the round a name.",
    );
    expect(
      validateNewRound({ ...valid, name: "a".repeat(roundNameMaxLength + 1) })
        .errors.name,
    ).toContain(String(roundNameMaxLength));
  });

  it("requires instructions", () => {
    const { errors, value } = validateNewRound({ ...valid, prompt: "  " });
    expect(value).toBeNull();
    expect(errors.prompt).toBe("Tell the student what to do.");
  });

  it("refuses instructions past the cap", () => {
    expect(
      validateNewRound({ ...valid, prompt: "a".repeat(roundPromptMaxLength + 1) })
        .value,
    ).toBeNull();
  });

  // A mode with no renderer would reach the student as a blank page mid-round.
  it.each(["", "interpretive dance", "TEXT", null, 7])(
    "refuses submission mode %p",
    (submissionMode) => {
      const { errors, value } = validateNewRound({ ...valid, submissionMode });
      expect(value).toBeNull();
      expect(errors.submissionMode).toBe("Choose what the student submits.");
    },
  );

  it("refuses non-string input rather than coercing it", () => {
    expect(validateNewRound({ ...valid, name: 7, prompt: {} }).value).toBeNull();
  });
});

describe("parseFieldLabels", () => {
  it("splits on either newline convention and drops blanks", () => {
    expect(parseFieldLabels("a\r\nb\n\n  c  \n")).toEqual(["a", "b", "c"]);
  });

  it("returns nothing for non-string input", () => {
    expect(parseFieldLabels(undefined)).toEqual([]);
    expect(parseFieldLabels(42)).toEqual([]);
  });
});

describe("parseRoundId", () => {
  it("accepts a positive whole number", () => {
    expect(parseRoundId("42")).toBe(42);
  });

  it.each(["0", "-1", "1.5", "abc", "", undefined, " 1", "1e3"])(
    "refuses %p",
    (raw) => {
      expect(parseRoundId(raw)).toBeNull();
    },
  );
});

describe("the closed sets behind the round query keys", () => {
  it("recognises a known code", () => {
    expect(parseRoundError("duplicate-name")).toBe("duplicate-name");
    expect(parseRoundNotice("created")).toBe("created");
  });

  it("refuses anything else, including a crafted payload", () => {
    expect(parseRoundError('<img src=x onerror="alert(1)">')).toBeNull();
    expect(parseRoundNotice("removed-everything")).toBeNull();
    expect(parseRoundError(undefined)).toBeNull();
  });

  // Object.hasOwn rather than `in`, so a prototype key is not mistaken for a
  // member of the set.
  it("refuses an inherited property name", () => {
    expect(parseRoundError("toString")).toBeNull();
    expect(parseRoundNotice("constructor")).toBeNull();
  });
});

describe("buildRoundsHref", () => {
  it("returns to the programme and anchors at the rounds panel", () => {
    expect(buildRoundsHref({ courseId: 7 })).toBe("/admin/courses/7#rounds");
  });

  it("carries a code under the ARS-specific key, so it cannot collide", () => {
    expect(buildRoundsHref({ courseId: 7, notice: "created" })).toBe(
      "/admin/courses/7?roundNotice=created#rounds",
    );
    expect(buildRoundsHref({ courseId: 7, error: "duplicate-name" })).toBe(
      "/admin/courses/7?roundError=duplicate-name#rounds",
    );
  });
});
