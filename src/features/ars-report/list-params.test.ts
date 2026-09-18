import { describe, expect, it } from "vitest";

import { buildReportsHref, parsePage } from "./list-params";

describe("parsePage", () => {
  it("reads a normal page number", () => {
    expect(parsePage("3")).toBe(3);
  });

  it("falls back to page one rather than throwing", () => {
    // A page number arrives from the query string, so a mistyped URL should show
    // the first page rather than an error boundary.
    for (const raw of [undefined, "", "0", "-1", "abc", "1.5", "1e3", " 2", "٣"]) {
      expect(parsePage(raw)).toBe(1);
    }
  });

  it("refuses a number long enough to be a denial of service", () => {
    // `.range()` on a huge offset is a slow scan for no result, so the digit
    // count is capped rather than the value.
    expect(parsePage("9".repeat(7))).toBe(1);
    expect(parsePage("999999")).toBe(999999);
  });

  it("takes the first value when a key is repeated", () => {
    // `?page=2&page=9` arrives as an array. Taking the first is arbitrary but it
    // must be deterministic, because the alternative is a page that changes on
    // reload.
    expect(parsePage(["2", "9"])).toBe(2);
    expect(parsePage([])).toBe(1);
  });
});

describe("buildReportsHref", () => {
  it("omits the query string on page one", () => {
    expect(buildReportsHref({ base: "/mentor", page: 1 })).toBe("/mentor");
    expect(buildReportsHref({ base: "/student", page: 1 })).toBe("/student");
  });

  it("carries a real page through", () => {
    expect(buildReportsHref({ base: "/mentor", page: 4 })).toBe("/mentor?page=4");
  });

  it("never emits a page below one", () => {
    expect(buildReportsHref({ base: "/student", page: 0 })).toBe("/student");
    expect(buildReportsHref({ base: "/student", page: -3 })).toBe("/student");
    expect(buildReportsHref({ base: "/student", page: Number.NaN })).toBe("/student");
  });

  it("builds the destination from the parsed page only", () => {
    // The base is a closed set in the type, and the page is a number, so no
    // caller-supplied string reaches the href. Same open-redirect reasoning as
    // buildCoursesHref.
    expect(buildReportsHref({ base: "/mentor", page: parsePage("2") })).toBe("/mentor?page=2");
    expect(buildReportsHref({ base: "/mentor", page: parsePage("../evil") })).toBe("/mentor");
  });
});
