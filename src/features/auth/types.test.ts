import { describe, expect, it } from "vitest";

import { isAppRole, roleHomePath } from "./types";

describe("application roles", () => {
  it.each(["admin", "mentor", "student"])("accepts %s", (role) => {
    expect(isAppRole(role)).toBe(true);
  });

  it.each(["authenticated", "service_role", "", null, 1])(
    "rejects non-application role %s",
    (role) => {
      expect(isAppRole(role)).toBe(false);
    },
  );

  it("maps roles to their home route", () => {
    expect(roleHomePath("admin")).toBe("/admin");
    expect(roleHomePath("mentor")).toBe("/mentor");
    expect(roleHomePath("student")).toBe("/student");
  });
});
