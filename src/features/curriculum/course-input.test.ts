import { describe, expect, it } from "vitest";

import {
  courseSortOrderMax,
  courseTitleMaxLength,
  validateNewCourse,
} from "./course-input";
import {
  buildCourseHref,
  buildCoursesHref,
  parseCourseId,
  parseCourseListError,
  parseCourseNotice,
  parsePageNumber,
  sanitizeCourseSearch,
} from "./list-params";

describe("validateNewCourse", () => {
  it("accepts a name and trims it", () => {
    const { errors, value } = validateNewCourse({
      sortOrder: "",
      title: "  Ashoka - aptitude prep  ",
    });

    expect(errors).toEqual({});
    expect(value).toEqual({ sortOrder: 0, title: "Ashoka - aptitude prep" });
  });

  it("defaults the ordering to 0 when it is left blank", () => {
    expect(validateNewCourse({ sortOrder: "   ", title: "X" }).value).toEqual({
      sortOrder: 0,
      title: "X",
    });
  });

  it("accepts a negative ordering, so a programme can be pinned above 0", () => {
    expect(validateNewCourse({ sortOrder: "-5", title: "X" }).value).toEqual({
      sortOrder: -5,
      title: "X",
    });
  });

  it("refuses a blank name", () => {
    const { errors, value } = validateNewCourse({
      sortOrder: "",
      title: "   ",
    });

    expect(value).toBeNull();
    expect(errors.title).toBe("Give the programme a name.");
  });

  it("refuses a name past the column's own limit", () => {
    const { errors, value } = validateNewCourse({
      sortOrder: "",
      title: "a".repeat(courseTitleMaxLength + 1),
    });

    expect(value).toBeNull();
    expect(errors.title).toContain(String(courseTitleMaxLength));
  });

  it("accepts a name at exactly the limit", () => {
    expect(
      validateNewCourse({
        sortOrder: "",
        title: "a".repeat(courseTitleMaxLength),
      }).errors,
    ).toEqual({});
  });

  // Number.parseInt reads "12abc" as 12, which would silently accept a typo and
  // order the programme somewhere the admin did not ask for.
  it("refuses an ordering that is only partly a number", () => {
    const { errors, value } = validateNewCourse({
      sortOrder: "12abc",
      title: "X",
    });

    expect(value).toBeNull();
    expect(errors.sortOrder).toBe("Use a whole number.");
  });

  it("refuses a fractional ordering", () => {
    expect(validateNewCourse({ sortOrder: "1.5", title: "X" }).value).toBeNull();
  });

  it("refuses an ordering past what the integer column can hold", () => {
    const { errors, value } = validateNewCourse({
      sortOrder: String(courseSortOrderMax + 1),
      title: "X",
    });

    expect(value).toBeNull();
    expect(errors.sortOrder).toBe("That number is too large.");
  });

  it("refuses non-string input rather than coercing it", () => {
    expect(validateNewCourse({ sortOrder: 5, title: 7 }).value).toBeNull();
  });
});

describe("sanitizeCourseSearch", () => {
  it("keeps an ordinary programme name intact", () => {
    expect(sanitizeCourseSearch("Masters' Union")).toBe("Masters' Union");
  });

  // The admin console shipped with this exact hole and it was found by probing
  // rather than by reading: a comma ends the current PostgREST filter and starts
  // another, so the term becomes a query of the attacker's choosing.
  it("strips the characters that would rewrite a PostgREST filter", () => {
    expect(sanitizeCourseSearch('x,role.eq.admin')).toBe("x role.eq.admin");
    expect(sanitizeCourseSearch("a(b)c")).toBe("a b c");
    expect(sanitizeCourseSearch('a"b\\c')).toBe("a b c");
  });

  it("strips the ilike wildcard so a search cannot match everything", () => {
    expect(sanitizeCourseSearch("%")).toBe("");
  });

  it("caps the term so an enormous query string cannot be posted", () => {
    expect(sanitizeCourseSearch("a".repeat(500))).toHaveLength(80);
  });
});

describe("parseCourseId", () => {
  it("accepts a positive whole number", () => {
    expect(parseCourseId("42")).toBe(42);
  });

  it.each(["0", "-1", "1.5", "abc", "", undefined, "1e3", " 1"])(
    "refuses %p",
    (raw) => {
      expect(parseCourseId(raw)).toBeNull();
    },
  );

  it("refuses a number too long to be a real id", () => {
    expect(parseCourseId("9".repeat(19))).toBeNull();
  });
});

describe("parsePageNumber", () => {
  it.each([
    ["2", 2],
    ["1", 1],
    ["0", 1],
    ["-3", 1],
    ["abc", 1],
    [undefined, 1],
  ])("reads %p as %p", (raw, expected) => {
    expect(parsePageNumber(raw)).toBe(expected);
  });
});

describe("the closed sets behind ?error= and ?notice=", () => {
  it("recognises a known code", () => {
    expect(parseCourseListError("duplicate-title")).toBe("duplicate-title");
    expect(parseCourseNotice("created")).toBe("created");
  });

  // The audit probed `?error=<img src=x onerror=...>`; a crafted value must
  // resolve to null so nothing reaches the page at all.
  it("refuses anything not in the set, including a crafted payload", () => {
    expect(parseCourseListError('<img src=x onerror="alert(1)">')).toBeNull();
    expect(parseCourseNotice("granted-everything")).toBeNull();
    expect(parseCourseListError(undefined)).toBeNull();
  });

  // Object.hasOwn rather than `in`, so a prototype key is not mistaken for a
  // member of the set.
  it("refuses an inherited property name", () => {
    expect(parseCourseListError("toString")).toBeNull();
    expect(parseCourseNotice("constructor")).toBeNull();
  });
});

describe("href building", () => {
  it("omits everything that is at its default", () => {
    expect(buildCoursesHref({ page: 1, search: "" })).toBe("/admin/courses");
    expect(buildCourseHref({ courseId: 7 })).toBe("/admin/courses/7");
  });

  it("carries the search term, page and notice", () => {
    expect(
      buildCoursesHref({ notice: "created", page: 3, search: "Ashoka" }),
    ).toBe("/admin/courses?q=Ashoka&page=3&notice=created");
  });

  // The destination is always rebuilt from a literal path, never from a posted
  // field, which is what stops the redirect after a grant being open.
  it("encodes a term rather than letting it alter the URL", () => {
    expect(buildCoursesHref({ page: 1, search: "a&b=c" })).toBe(
      "/admin/courses?q=a%26b%3Dc",
    );
  });
});
