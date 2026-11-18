import { describe, expect, it } from "vitest";

import { mockPageHref, resolveAttemptCourse } from "./attempt-course";

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
  it("carries the running attempt's programme", () => {
    expect(mockPageHref(9, [{ courseId: 4, status: "in_progress" }])).toBe("/student/mocks/9?course=4");
  });
  it("is the plain page otherwise", () => {
    expect(mockPageHref(9, [{ courseId: 4, status: "submitted" }])).toBe("/student/mocks/9");
    expect(mockPageHref(9, [{ courseId: null, status: "in_progress" }])).toBe("/student/mocks/9");
  });
});
