import { describe, expect, it } from "vitest";

import {
  attachFailure,
  canHoldItem,
  groupAttachments,
  hasMocksSection,
  mocksSectionFailure,
} from "./attachments";

describe("attachFailure", () => {
  it("names a duplicate attachment", () => {
    expect(attachFailure({ code: "23505", message: "duplicate key" })).toBe("module-already-attached");
  });
  it("names the mocks section", () => {
    expect(attachFailure({ code: "P0001", message: "a module cannot be attached to the mocks section" })).toBe("mocks-no-modules");
  });
  it("falls back to a plain failure", () => {
    expect(attachFailure({ code: "42501", message: "denied" })).toBe("module-attach-failed");
    expect(attachFailure({})).toBe("module-attach-failed");
  });
});

describe("mocks section", () => {
  it("reports a second one as existing", () => {
    expect(mocksSectionFailure({ code: "23505" })).toBe("mocks-exists");
    expect(mocksSectionFailure({ code: "42501" })).toBe("mocks-failed");
  });
  it("holds only tests", () => {
    expect(canHoldItem({ kind: "mocks" }, "test")).toBe(true);
    expect(canHoldItem({ kind: "mocks" }, "video")).toBe(false);
    expect(canHoldItem({ kind: "subject" }, "video")).toBe(true);
  });
  it("is found among sections", () => {
    expect(hasMocksSection([{ kind: "subject" }])).toBe(false);
    expect(hasMocksSection([{ kind: "subject" }, { kind: "mocks" }])).toBe(true);
  });
});

describe("groupAttachments", () => {
  it("groups by subject, ordered, with item counts", () => {
    const grouped = groupAttachments([
      { module_id: 5, modules: { curriculum_items: [{ count: 3 }], title: "B" }, section_id: 1, sort_order: 1 },
      { module_id: 4, modules: { curriculum_items: [], title: "A" }, section_id: 1, sort_order: 0 },
      { module_id: 4, modules: { curriculum_items: [{ count: 2 }], title: "A" }, section_id: 2, sort_order: 0 },
      { module_id: 9, modules: null, section_id: 2, sort_order: 1 },
    ]);
    expect(grouped.get(1)?.map((m) => [m.title, m.itemCount])).toEqual([["A", 0], ["B", 3]]);
    expect(grouped.get(2)).toHaveLength(1);
  });
});
