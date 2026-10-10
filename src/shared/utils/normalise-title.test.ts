import { describe, expect, it } from "vitest";

import { normaliseTitle } from "./normalise-title";

describe("normaliseTitle", () => {
  it("capitalises a lower-case first letter", () => {
    expect(normaliseTitle("ashoka")).toBe("Ashoka");
  });

  it("trims leading and trailing spaces", () => {
    expect(normaliseTitle("   ashoka university  ")).toBe("Ashoka university");
  });

  it("collapses double spaces, tabs and newlines to one space", () => {
    expect(normaliseTitle("cat  2026 \t mock\n1")).toBe("Cat 2026 mock 1");
  });

  it("leaves an already-capitalised title exactly as typed", () => {
    expect(normaliseTitle("IIM Indore")).toBe("IIM Indore");
  });

  it("changes only the first letter, never the rest", () => {
    expect(normaliseTitle("iPMAT prep")).toBe("IPMAT prep");
  });

  it("leaves a digit or a symbol first", () => {
    expect(normaliseTitle("2026 batch")).toBe("2026 batch");
    expect(normaliseTitle("#1 mock")).toBe("#1 mock");
    expect(normaliseTitle("(draft) notes")).toBe("(draft) notes");
  });

  it("returns an empty string for an empty or blank value", () => {
    expect(normaliseTitle("")).toBe("");
    expect(normaliseTitle("   ")).toBe("");
  });

  it("capitalises a non-ASCII first letter", () => {
    expect(normaliseTitle("éclair batch")).toBe("Éclair batch");
    expect(normaliseTitle("über prep")).toBe("Über prep");
  });

  it("leaves a script without case untouched", () => {
    expect(normaliseTitle("हिंदी batch")).toBe("हिंदी batch");
  });

  it("leaves a letter whose capital is two letters", () => {
    expect(normaliseTitle("ßeta")).toBe("ßeta");
  });
});
