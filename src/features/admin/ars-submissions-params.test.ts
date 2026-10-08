import { describe, expect, it } from "vitest";

import { buildArsSubmissionsHref, parseArsSubmissionFilters } from "./ars-submissions-params";

describe("parseArsSubmissionFilters", () => {
  it("reads every filter", () => {
    expect(parseArsSubmissionFilters({ page: "3", process: "12", round: "40", status: "reviewed" }))
      .toEqual({ page: 3, processId: 12, roundId: 40, status: "reviewed" });
  });

  it("treats junk as no filter", () => {
    expect(parseArsSubmissionFilters({ page: "-2", process: "1,2", round: "0", status: "deleted" }))
      .toEqual({ page: 1, processId: null, roundId: null, status: null });
    expect(parseArsSubmissionFilters({ process: ["1", "2"], round: "99999999999999999999" }))
      .toEqual({ page: 1, processId: null, roundId: null, status: null });
  });
});

describe("buildArsSubmissionsHref", () => {
  it("omits empty filters and page one", () => {
    expect(buildArsSubmissionsHref({ page: 1 })).toBe("/admin/ars-submissions");
    expect(buildArsSubmissionsHref({ page: 2, processId: 5, roundId: null, status: "draft" }))
      .toBe("/admin/ars-submissions?process=5&status=draft&page=2");
  });
});
