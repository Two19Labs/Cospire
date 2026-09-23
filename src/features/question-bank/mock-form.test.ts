import { describe, expect, it } from "vitest";

import { mapSectionSlots, maxMockSections, parseSectionSlot } from "./mock-form";

describe("mapSectionSlots", () => {
  it("is the identity when the slots are filled from the top", () => {
    expect([...mapSectionSlots([0, 1, 2])]).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  // The defect: "Section 1" left blank, "Section 2" and "Section 3" filled. The
  // dropdown posts 1 and 2; the saved mock has sections at 0 and 1.
  it("shifts every slot down when an earlier slot is blank", () => {
    const map = mapSectionSlots([1, 2]);
    expect(map.get(1)).toBe(0);
    expect(map.get(2)).toBe(1);
  });

  it("has no entry for a blank slot, so a question posted against one is refused", () => {
    expect(mapSectionSlots([1, 2]).get(0)).toBeUndefined();
  });
});

describe("parseSectionSlot", () => {
  it("accepts a rendered slot, including zero", () => {
    expect(parseSectionSlot("0")).toBe(0);
    expect(parseSectionSlot(String(maxMockSections - 1))).toBe(maxMockSections - 1);
  });

  it("refuses a missing, blank or malformed field rather than defaulting to the first section", () => {
    for (const value of [null, "", " ", "abc", "-1", "1.5", "1e2"]) {
      expect(parseSectionSlot(value)).toBeNull();
    }
  });

  it("refuses a slot the form never renders", () => {
    expect(parseSectionSlot(String(maxMockSections))).toBeNull();
    expect(parseSectionSlot("999")).toBeNull();
  });
});
