import { describe, expect, it } from "vitest";

import {
  orderWeightageChanges,
  parseFlag,
  parseId,
  parseMetricNames,
  parseOptionalId,
  parseVocabulary,
  validateComponentTitle,
  validateMetricLabel,
  validateTemplateName,
  validateWeightage,
} from "./template-input";

describe("validateWeightage", () => {
  it("accepts a percentage with up to two decimals", () => {
    expect(validateWeightage("20")).toBe(20);
    expect(validateWeightage("12.5")).toBe(12.5);
    expect(validateWeightage("33.33")).toBe(33.33);
    expect(validateWeightage("100")).toBe(100);
  });

  it("refuses zero, because a component that cannot move the total should not be in the table", () => {
    expect(validateWeightage("0")).toBeNull();
    expect(validateWeightage("0.00")).toBeNull();
  });

  it("refuses anything outside the column's range or precision", () => {
    for (const raw of ["101", "-5", "12.345", "1e2", "20%", "", "abc", null]) {
      expect(validateWeightage(raw)).toBeNull();
    }
  });

  it("trims surrounding whitespace, unlike a URL parameter", () => {
    // Deliberate, and the opposite of `parsePage`, which refuses " 2". This
    // field is typed by an admin and a stray space is a slip, not an attack;
    // a page number arrives in a URL where a space means someone built it by
    // hand.
    expect(validateWeightage(" 20 ")).toBe(20);
  });
});

describe("orderWeightageChanges", () => {
  // The reason this function exists: the weightage-total trigger is DEFERRABLE
  // INITIALLY DEFERRED, so several changes in ONE transaction are judged only on
  // the final total. PostgREST commits each request separately, so applying a
  // raise before its matching drop is refused even when the end state is legal.
  it("applies every decrease before any increase", () => {
    const ordered = orderWeightageChanges([
      { current: 40, id: 1, next: 60 },
      { current: 60, id: 2, next: 40 },
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual([2, 1]);
  });

  it("never lets the running total exceed the final total", () => {
    const changes = [
      { current: 10, id: 1, next: 50 },
      { current: 50, id: 2, next: 10 },
      { current: 40, id: 3, next: 40 },
    ];
    let running = changes.reduce((sum, entry) => sum + entry.current, 0);
    const finalTotal = changes.reduce((sum, entry) => sum + entry.next, 0);
    for (const change of orderWeightageChanges(changes)) {
      running += change.next - change.current;
      expect(running).toBeLessThanOrEqual(Math.max(finalTotal, 100));
    }
    expect(running).toBe(finalTotal);
  });

  it("drops rows that did not change, so no needless write is issued", () => {
    expect(orderWeightageChanges([{ current: 25, id: 1, next: 25 }])).toEqual([]);
  });
});

describe("parseVocabulary and parseMetricNames", () => {
  it("splits on newlines or commas, because an admin pasting will do either", () => {
    expect(parseVocabulary("Ready\nDeveloping\nNeeds Work")).toEqual([
      "Ready",
      "Developing",
      "Needs Work",
    ]);
    expect(parseVocabulary("Ready, Developing")).toEqual(["Ready", "Developing"]);
  });

  it("drops blanks and duplicates rather than refusing", () => {
    // A trailing comma is a typo, not an error worth a round trip. A duplicate
    // would offer the same word twice in one dropdown.
    expect(parseVocabulary("Ready,, Developing, Ready,")).toEqual(["Ready", "Developing"]);
    expect(parseVocabulary("")).toEqual([]);
    expect(parseVocabulary(null)).toEqual([]);
  });

  it("refuses a list long enough to be a mistake", () => {
    expect(parseVocabulary(Array.from({ length: 21 }, (_, i) => `t${i}`).join(","))).toBeNull();
    expect(parseVocabulary("x".repeat(41))).toBeNull();
    expect(parseMetricNames("x".repeat(81))).toBeNull();
    expect(parseMetricNames("x".repeat(80))).toEqual(["x".repeat(80)]);
  });
});

describe("parseFlag", () => {
  it("treats an absent checkbox as false", () => {
    // An unticked checkbox is absent from the form data entirely, and a
    // hand-posted "false" must not read as true.
    expect(parseFlag(null)).toBe(false);
    expect(parseFlag("false")).toBe(false);
    expect(parseFlag("off")).toBe(false);
    expect(parseFlag("on")).toBe(true);
  });
});

describe("parseId and parseOptionalId", () => {
  it("accepts only a positive whole number", () => {
    expect(parseId("7")).toBe(7);
    for (const raw of ["0", "-1", "1.5", "abc", "", " 7", null, undefined]) {
      expect(parseId(raw)).toBeNull();
    }
  });

  it("treats an empty optional id as absent rather than invalid", () => {
    // A component need not belong to a round: the Client's own report assesses
    // the student's profile, which has nothing to submit.
    expect(parseOptionalId("")).toEqual({ ok: true, value: null });
    expect(parseOptionalId(null)).toEqual({ ok: true, value: null });
    expect(parseOptionalId("4")).toEqual({ ok: true, value: 4 });
    expect(parseOptionalId("nope")).toEqual({ ok: false, value: null });
  });
});

describe("text fields", () => {
  it("trims and bounds a name", () => {
    expect(validateTemplateName("  Final Assessment  ")).toBe("Final Assessment");
    expect(validateTemplateName("")).toBeNull();
    expect(validateTemplateName("   ")).toBeNull();
    expect(validateTemplateName("x".repeat(121))).toBeNull();
    expect(validateComponentTitle("x".repeat(120))).toBe("x".repeat(120));
  });

  it("defaults the metric heading instead of refusing it", () => {
    // The column heading is the least important thing on the screen, and
    // "Metric" is right four times out of five in the Client's own report.
    expect(validateMetricLabel("")).toBe("Metric");
    expect(validateMetricLabel(null)).toBe("Metric");
    expect(validateMetricLabel("Criteria")).toBe("Criteria");
    expect(validateMetricLabel("x".repeat(41))).toBeNull();
  });
});
