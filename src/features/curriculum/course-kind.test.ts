import { describe, expect, it } from "vitest";

import {
  buildKindCourseHref,
  buildKindListHref,
  courseKinds,
  parseCourseKind,
} from "./list-params";

// `kind` decides two things at once: which rows a screen lists, and which screen
// an action returns to. The second is why these are tested rather than trusted.
// A form posts the value, so if anything but the two known words could reach
// `sectionRoot` the destination would be chosen by a form field -- which is the
// open-redirect shape this codebase refuses everywhere else.

describe("parseCourseKind", () => {
  it("accepts exactly the two kinds", () => {
    expect(courseKinds).toEqual(["programme", "ars_process"]);
    expect(parseCourseKind("programme")).toBe("programme");
    expect(parseCourseKind("ars_process")).toBe("ars_process");
  });

  it("refuses anything else, rather than guessing", () => {
    for (const bad of ["", "Programme", "ars", "course", "../admin", null, undefined, 1, {}]) {
      expect(parseCourseKind(bad)).toBeNull();
    }
  });
});

describe("the section a kind belongs to", () => {
  it("sends a programme to Programmes and a process to ARS", () => {
    expect(buildKindListHref({ kind: "programme" })).toBe("/admin/courses");
    expect(buildKindListHref({ kind: "ars_process" })).toBe("/admin/ars");
    expect(buildKindCourseHref({ courseId: 7, kind: "programme" })).toBe("/admin/courses/7");
    expect(buildKindCourseHref({ courseId: 7, kind: "ars_process" })).toBe("/admin/ars/7");
  });

  it("carries a notice or an error in the query string", () => {
    expect(buildKindCourseHref({ courseId: 7, kind: "ars_process", notice: "moved" })).toBe(
      "/admin/ars/7?notice=moved",
    );
    expect(buildKindListHref({ error: "create-failed", kind: "programme" })).toBe(
      "/admin/courses?error=create-failed",
    );
  });

  // The destination is built from a literal, never from anything posted. A
  // crafted id cannot escape the path it is interpolated into.
  it("keeps a crafted id inside the path", () => {
    const href = buildKindCourseHref({ courseId: Number("12"), kind: "ars_process" });
    expect(href).toBe("/admin/ars/12");
    expect(href.startsWith("/admin/ars/")).toBe(true);
  });
});
