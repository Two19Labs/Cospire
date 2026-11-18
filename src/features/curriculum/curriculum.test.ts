import { describe, expect, it } from "vitest";

import {
  completionPercent,
  isItemComplete,
  nextSortOrder,
  normaliseBody,
  normaliseTitle,
  parseItemType,
  parsePlacement,
  parsePositiveId,
  planMove,
  progressByCourse,
  splitSections,
  summariseProgress,
  uniqueItems,
  studentItemHref,
} from "./curriculum";

describe("parsePlacement", () => {
  it("reads a programme and section, from numbers or form strings", () => {
    expect(parsePlacement({ courseId: 3, sectionId: "12" })).toEqual({ courseId: 3, sectionId: 12 });
  });

  it("refuses anything a hand-crafted request could send", () => {
    for (const raw of [null, undefined, "3", 7, {}, { courseId: 3 }, { courseId: 3, sectionId: "" },
      { courseId: -1, sectionId: 2 }, { courseId: 3, sectionId: "2; drop" }, { courseId: 1.5, sectionId: 2 }]) {
      expect(parsePlacement(raw)).toBeNull();
    }
  });
});

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
    expect(parseItemType("video")).toBe("video");
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
    expect(studentItemHref(4, { id: 1, refId: 9, type: "test" })).toBe("/student/mocks/9?course=4");
    expect(studentItemHref(4, { id: 2, refId: null, type: "text" })).toBe(
      "/student/programmes/4/items/2",
    );
    expect(studentItemHref(4, { id: 3, refId: 5, type: "document" })).toBeNull();
    expect(studentItemHref(4, { id: 6, refId: 5, type: "video" })).toBe(
      "/student/programmes/4/items/6",
    );
  });
});

describe("progressByCourse", () => {
  const pdf = { id: 7, refId: 3, type: "document" as const };
  const quiz = { id: 8, refId: 5, type: "test" as const };
  const progress = progressByCourse(
    [
      { completed: true, course_id: 1, item_id: 7 },
      { completed: false, course_id: 2, item_id: 7 },
    ],
    [
      { course_id: 2, mock_id: 5 },
      { course_id: null, mock_id: 5 },
    ],
  );

  it("counts a shared item only in the programme its row was made in", () => {
    expect(isItemComplete(pdf, progress(1))).toBe(true);
    expect(isItemComplete(pdf, progress(2))).toBe(false);
  });

  it("counts a test only for an attempt taken from that programme", () => {
    expect(isItemComplete(quiz, progress(2))).toBe(true);
    expect(isItemComplete(quiz, progress(1))).toBe(false);
  });

  it("gives a programme with no rows nothing done", () => {
    expect(isItemComplete(pdf, progress(9))).toBe(false);
    expect(isItemComplete(quiz, progress(9))).toBe(false);
  });
});

describe("module progress per programme", () => {
  const items = [
    { id: 1, refId: null, type: "text" as const },
    { id: 2, refId: null, type: "video" as const },
    { id: 3, refId: 50, type: "test" as const },
  ];
  const progress = progressByCourse(
    [
      { completed: true, course_id: 10, item_id: 1 },
      { completed: true, course_id: 20, item_id: 1 },
      { completed: true, course_id: 20, item_id: 2 },
    ],
    [
      { course_id: 20, mock_id: 50 },
      { course_id: null, mock_id: 50 },
    ],
  );

  it("counts the same module independently in each programme", () => {
    expect(summariseProgress(items, progress(10))).toEqual({ complete: 1, percent: 33, total: 3 });
    expect(summariseProgress(items, progress(20))).toEqual({ complete: 3, percent: 100, total: 3 });
    expect(summariseProgress(items, progress(30))).toEqual({ complete: 0, percent: 0, total: 3 });
  });

  it("counts an item reached twice once", () => {
    expect(summariseProgress([...items, items[0]], progress(10)).total).toBe(3);
    expect(uniqueItems([{ id: 1 }, { id: 1 }, { id: 2 }])).toHaveLength(2);
  });

  it("an empty module is 0 of 0", () => {
    expect(summariseProgress([], progress(10))).toEqual({ complete: 0, percent: 0, total: 0 });
  });
});

describe("splitSections", () => {
  it("puts the mocks section apart, after the subjects, whatever its sort_order", () => {
    const { mocks, subjects } = splitSections([
      { id: 1, kind: "mocks", sortOrder: 0 },
      { id: 3, kind: "subject", sortOrder: 2 },
      { id: 2, kind: "subject", sortOrder: 1 },
    ]);
    expect(mocks?.id).toBe(1);
    expect(subjects.map((s) => s.id)).toEqual([2, 3]);
  });

  it("has no mocks block when there is none", () => {
    expect(splitSections([{ id: 1, kind: "subject", sortOrder: 0 }]).mocks).toBeNull();
  });
});
