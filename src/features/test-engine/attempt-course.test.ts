import { describe, expect, it } from "vitest";

import { attemptsCourse, attemptsIn, mockPageHref, pageCourse, resolveAttemptCourse } from "./attempt-course";

describe("resolveAttemptCourse", () => {
  it("uses no programme when the mock is granted directly", () => {
    expect(resolveAttemptCourse(true, [4])).toEqual({ courseId: null, kind: "ok" });
  });
  it("uses the one programme that holds the mock", () => {
    expect(resolveAttemptCourse(false, [4, 4])).toEqual({ courseId: 4, kind: "ok" });
  });
  it("asks for a programme page when several hold it", () => {
    expect(resolveAttemptCourse(false, [4, 5])).toEqual({ kind: "choose" });
  });
  it("refuses when nothing grants it", () => {
    expect(resolveAttemptCourse(false, [])).toEqual({ kind: "none" });
  });
});

describe("mockPageHref", () => {
  it("carries the latest attempt's programme, open or submitted", () => {
    expect(mockPageHref(9, [{ courseId: 4, status: "in_progress" }])).toBe("/student/mocks/9?course=4");
    expect(mockPageHref(9, [{ courseId: 4, status: "submitted" }])).toBe("/student/mocks/9?course=4");
  });
  it("is the plain page with no attempts or a null-bucket latest", () => {
    expect(mockPageHref(9, [])).toBe("/student/mocks/9");
    expect(mockPageHref(9, [{ courseId: null, status: "submitted" }])).toBe("/student/mocks/9");
  });
});

describe("attempt buckets", () => {
  const attempts = [{ courseId: 5 }, { courseId: 4 }, { courseId: 5 }, { courseId: null }];
  it("counts only the programme's own attempts", () => {
    expect(attemptsIn(attempts, 5)).toHaveLength(2);
    expect(attemptsIn(attempts, null)).toHaveLength(1);
    expect(attemptsIn(attempts, 9)).toHaveLength(0);
  });
  it("takes the newest attempt's bucket", () => {
    expect(attemptsCourse(attempts)).toBe(5);
    expect(attemptsCourse([])).toBeNull();
  });
});

describe("pageCourse", () => {
  it("keeps a requested programme that holds the mock", () => {
    expect(pageCourse(4, true, [4])).toBe(4);
  });
  it("falls back to the direct grant when the programme no longer holds it", () => {
    expect(pageCourse(4, true, [])).toBeNull();
    expect(pageCourse(4, true, [5])).toBeNull();
  });
  it("falls back to the single held programme, or none", () => {
    expect(pageCourse(4, false, [5])).toBe(5);
    expect(pageCourse(4, false, [5, 6])).toBeNull();
    expect(pageCourse(null, false, [5])).toBe(5);
  });
});
