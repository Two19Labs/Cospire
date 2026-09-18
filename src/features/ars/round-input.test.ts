import { describe, expect, it } from "vitest";

import {
  buildRoundsHref,
  parseRoundError,
  parseRoundId,
  parseRoundNotice,
} from "./list-params";
import {
  formatRoundDay,
  parseFieldLabels,
  parseRoundDay,
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
      dueAt: null,
      name: "Guesstimate",
      opensAt: null,
      requiresReview: false,
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

    // The builder's shape from the outset, so opening the round in the builder
    // needs no conversion step.
    const steps = value?.config.steps as
      | { sections: { fields: { label: string; type: string }[] }[]; title: string }[]
      | undefined;

    expect(steps).toHaveLength(1);
    expect(steps?.[0].title).toBe("Page 1");
    expect(steps?.[0].sections[0].fields.map((field) => field.label)).toEqual([
      "Why this school?",
      "What will you contribute?",
    ]);
    expect(steps?.[0].sections[0].fields[0].type).toBe("short_text");
  });

  // Changed on 2026-09-18, when the round builder landed. Requiring the
  // questions up front made the builder unreachable: the round could not exist
  // without already carrying the very thing the builder is for, and the field
  // was labelled optional while the database refused it.
  //
  // What still protects the student is the widened database constraint: a form
  // round must carry a `steps` array, which this now always writes.
  it("accepts a form round with no questions, to be built afterwards", () => {
    const { errors, value } = validateNewRound({
      ...valid,
      fields: "   \n  \n",
      submissionMode: "form",
    });

    expect(errors.fields).toBeUndefined();
    expect(value).not.toBeNull();

    const steps = value?.config.steps as { sections: { fields: unknown[] }[] }[] | undefined;
    expect(steps).toHaveLength(1);
    expect(steps?.[0].sections[0].fields).toEqual([]);
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

describe("round dates", () => {
  it("reads an opening date as the start of that day in IST", () => {
    // 00:00 IST is 18:30 UTC the evening before. Stored as an instant, so the
    // database never has to know which time zone an admin was sitting in.
    expect(parseRoundDay("2026-10-01", "start")).toBe("2026-09-30T18:30:00.000Z");
  });

  it("reads a deadline as the end of that day, not its start", () => {
    // A deadline of the 1st means the student has all of the 1st. Taking the
    // start of the day would quietly cost them 24 hours.
    expect(parseRoundDay("2026-10-01", "end")).toBe("2026-10-01T18:29:59.000Z");
  });

  it("treats an empty date as absent, and a malformed one as an error", () => {
    expect(parseRoundDay("", "start")).toBeNull();
    expect(parseRoundDay(undefined, "start")).toBeNull();
    expect(parseRoundDay("01/10/2026", "start")).toBeUndefined();
    expect(parseRoundDay("2026-13-45", "start")).toBeUndefined();
  });

  it("shows a stored instant back as the day the admin meant", () => {
    // The round trip that matters: what was typed is what is displayed, even
    // though the stored instant falls on the previous date in UTC.
    expect(formatRoundDay("2026-09-30T18:30:00.000Z")).toBe("2026-10-01");
    expect(formatRoundDay("2026-10-01T18:29:59.000Z")).toBe("2026-10-01");
    expect(formatRoundDay(null)).toBeNull();
  });

  it("refuses a deadline that falls before the opening date", () => {
    const { errors, value } = validateNewRound({
      ...valid,
      dueAt: "2026-10-01",
      opensAt: "2026-10-09",
    });

    expect(value).toBeNull();
    expect(errors.dates).toBeTruthy();
  });

  it("accepts a deadline on the same day it opens", () => {
    const { value } = validateNewRound({
      ...valid,
      dueAt: "2026-10-01",
      opensAt: "2026-10-01",
    });

    expect(value?.opensAt).toBe("2026-09-30T18:30:00.000Z");
    expect(value?.dueAt).toBe("2026-10-01T18:29:59.000Z");
  });

  it("treats an absent review checkbox as no review", () => {
    // An unticked checkbox sends nothing at all, so this is the difference
    // between an application nobody reads and an essay a mentor must.
    expect(validateNewRound(valid).value?.requiresReview).toBe(false);
    expect(
      validateNewRound({ ...valid, requiresReview: "on" }).value?.requiresReview,
    ).toBe(true);
  });
});

describe("the offline round", () => {
  it("is a mode an admin can choose", () => {
    const { value } = validateNewRound({ ...valid, submissionMode: "offline" });

    expect(value?.submissionMode).toBe("offline");
    // No questions are required: the student submits nothing, because the
    // interview or group discussion happens off the platform.
    expect(value?.config.fields).toBeUndefined();
  });
});
