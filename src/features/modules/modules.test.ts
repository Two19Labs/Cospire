import { describe, expect, it } from "vitest";

import { buildModuleHref, buildModulesHref, copyTitle, parseModuleMessage, programmesByModule } from "./modules";

describe("copyTitle", () => {
  it("appends (copy)", () => expect(copyTitle("Time and Work")).toBe("Time and Work (copy)"));
  it("tidies the base", () => expect(copyTitle("  Time   and Work ")).toBe("Time and Work (copy)"));
  it("stays within 200 characters", () => {
    const result = copyTitle("A".repeat(200));
    expect(result.length).toBe(200);
    expect(result.endsWith(" (copy)")).toBe(true);
  });
});

describe("programmesByModule", () => {
  it("counts a programme once however many of its subjects hold the module", () => {
    const result = programmesByModule([
      { courseId: 2, courseTitle: "MU", moduleId: 1 },
      { courseId: 2, courseTitle: "MU", moduleId: 1 },
      { courseId: 1, courseTitle: "Ashoka", moduleId: 1 },
      { courseId: 1, courseTitle: "Ashoka", moduleId: 7 },
    ]);
    expect(result.get(1)).toEqual([{ id: 1, title: "Ashoka" }, { id: 2, title: "MU" }]);
    expect(result.get(7)?.length).toBe(1);
    expect(result.get(99)).toBeUndefined();
  });
});

describe("messages and links", () => {
  it("accepts only known messages, never inherited keys", () => {
    expect(parseModuleMessage("created")).toBe("created");
    expect(parseModuleMessage("<img onerror=x>")).toBeNull();
    expect(parseModuleMessage("__proto__")).toBeNull();
    expect(parseModuleMessage(undefined)).toBeNull();
  });
  it("builds list and detail links from parsed values", () => {
    expect(buildModulesHref({ page: 1, search: "" })).toBe("/admin/modules");
    expect(buildModulesHref({ page: 3, search: "tough" })).toBe("/admin/modules?q=tough&page=3");
    expect(buildModuleHref(5, "renamed")).toBe("/admin/modules/5?m=renamed");
  });
});
