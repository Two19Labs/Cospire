import { describe, expect, it } from "vitest";

import {
  completionPercent,
  isItemComplete,
  nextSortOrder,
  normaliseBody,
  normaliseTitle,
  parseItemType,
  parsePositiveId,
  planMove,
  studentItemHref,
} from "./curriculum";

describe("planMove", () => {
  const rows = [
    { id: 1, sortOrder: 0 },
    { id: 2, sortOrder: 1 },
    { id: 3, sortOrder: 2 },
  ];

  it("moves an entry up and returns only the rows that change", () => {
    expect(planMove(rows, 3, "up")).toEqual([
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
  });

  it("moves an entry down", () => {
    expect(planMove(rows, 1, "down")).toEqual([
      { id: 2, sortOrder: 0 },
      { id: 1, sortOrder: 1 },
    ]);
  });

  it("does nothing at either end or for an unknown id", () => {
    expect(planMove(rows, 1, "up")).toEqual([]);
    expect(planMove(rows, 3, "down")).toEqual([]);
    expect(planMove(rows, 9, "up")).toEqual([]);
  });

  it("repairs ties left by a half-finished move, breaking them on id", () => {
    const tied = [
      { id: 5, sortOrder: 0 },
      { id: 4, sortOrder: 0 },
      { id: 6, sortOrder: 0 },
    ];
    // Current order is 4, 5, 6. Moving 6 up gives 4, 6, 5.
    expect(planMove(tied, 6, "up")).toEqual([
      { id: 6, sortOrder: 1 },
      { id: 5, sortOrder: 2 },
    ]);
  });
});

describe("nextSortOrder", () => {
  it("appends after the highest", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([{ id: 1, sortOrder: 4 }, { id: 2, sortOrder: 1 }])).toBe(5);
  });
});

describe("input parsing", () => {
  it("accepts only buildable item types; video waits for the video library", () => {
    expect(parseItemType("document")).toBe("document");
    expect(parseItemType("text")).toBe("text");
    expect(parseItemType("video")).toBeNull();
    expect(parseItemType("lesson")).toBeNull();
  });

  it("parses ids strictly", () => {
    expect(parsePositiveId("12")).toBe(12);
    expect(parsePositiveId("0")).toBeNull();
    expect(parsePositiveId("1e3")).toBeNull();
    expect(parsePositiveId(undefined)).toBeNull();
  });

  it("normalises titles and bodies to what the database accepts", () => {
    expect(normaliseTitle("  Week  1  ")).toBe("Week 1");
    expect(normaliseTitle("   ")).toBeNull();
    expect(normaliseTitle("x".repeat(201))).toBeNull();
    expect(normaliseBody(" a\r\nb ")).toBe("a\nb");
    expect(normaliseBody("")).toBeNull();
  });
});

describe("progress", () => {
  const progress = { stored: new Map([[10, true], [11, false]]), submittedMocks: new Set([7]) };

  it("derives a test's completion from a submitted attempt", () => {
    expect(isItemComplete({ id: 1, refId: 7, type: "test" }, progress)).toBe(true);
    expect(isItemComplete({ id: 2, refId: 8, type: "test" }, progress)).toBe(false);
  });

  it("reads documents and text from stored progress", () => {
    expect(isItemComplete({ id: 10, refId: 3, type: "document" }, progress)).toBe(true);
    expect(isItemComplete({ id: 11, refId: null, type: "text" }, progress)).toBe(false);
    expect(isItemComplete({ id: 12, refId: null, type: "text" }, progress)).toBe(false);
  });

  it("rounds a completion percentage and survives an empty programme", () => {
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(0, 0)).toBe(0);
  });

  it("links a test to the mock and text to the item page; documents open by form", () => {
    expect(studentItemHref(4, { id: 1, refId: 9, type: "test" })).toBe("/student/mocks/9");
    expect(studentItemHref(4, { id: 2, refId: null, type: "text" })).toBe(
      "/student/programmes/4/items/2",
    );
    expect(studentItemHref(4, { id: 3, refId: 5, type: "document" })).toBeNull();
  });
});
