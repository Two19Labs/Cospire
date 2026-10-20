import { describe, expect, it } from "vitest";

import { pickView, type SectionView } from "./section-views";

const views: SectionView[] = [
  { description: "", href: "/x?view=list", key: "list", label: "List" },
  { description: "", href: "/x?view=add", key: "add", label: "Add" },
];

describe("pickView", () => {
  it("shows the cards when the section is simply opened", () => {
    expect(pickView({}, views, "list")).toBeNull();
  });

  it("shows the view the address names", () => {
    expect(pickView({ view: "add" }, views, "list")).toBe("add");
  });

  it("falls back to the list for an unknown view, a save's notice, a search or a page", () => {
    expect(pickView({ view: "nonsense", page: "2" }, views, "list")).toBe("list");
    expect(pickView({ notice: "uploaded" }, views, "list")).toBe("list");
    expect(pickView({ q: "" }, views, "list")).toBe("list");
  });

  it("shows the cards for an unknown view with nothing else", () => {
    expect(pickView({ view: "nonsense" }, views, "list")).toBeNull();
  });
});
