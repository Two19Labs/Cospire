import { describe, expect, it } from "vitest";

import {
  addField,
  addPage,
  addSection,
  emptyForm,
  moveField,
  readyForStudents,
  removeField,
  removePage,
  removeSection,
  renamePage,
  toKey,
} from "./form-builder";
import type { FormSpec } from "./form-schema";

function unwrap(result: ReturnType<typeof addPage>): FormSpec {
  if (!result.ok) throw new Error(`expected success, got: ${result.message}`);
  return result.spec;
}

describe("toKey", () => {
  it("turns a label into a storable key", () => {
    expect(toKey("Full Name", new Set())).toBe("full_name");
    expect(toKey("Parent / Guardian Name", new Set())).toBe("parent_guardian_name");
    expect(toKey("Percentage / CGPA", new Set())).toBe("percentage_cgpa");
  });

  it("never collides with a key already in the form", () => {
    // Two fields sharing a key would silently overwrite one another's answer.
    const taken = new Set(["board"]);
    expect(toKey("Board", taken)).toBe("board_2");
    taken.add("board_2");
    expect(toKey("Board", taken)).toBe("board_3");
  });

  it("produces something valid from unusable input", () => {
    expect(toKey("???", new Set())).toBe("field");
    expect(toKey("12th Board", new Set())).toBe("f_12th_board");
    expect(toKey("", new Set())).toBe("field");
  });
});

describe("pages", () => {
  it("starts with one page, so a simple round needs no page management", () => {
    expect(emptyForm.steps).toHaveLength(1);
  });

  it("adds and renames pages", () => {
    let spec = unwrap(renamePage(emptyForm, "page_1", "Personal Details"));
    spec = unwrap(addPage(spec, "Academic Details"));
    expect(spec.steps.map((step) => step.title)).toEqual(["Personal Details", "Academic Details"]);
  });

  it("refuses to delete the last page", () => {
    // A form with no pages renders as "nothing to fill in" to the student.
    const result = removePage(emptyForm, "page_1");
    expect(result.ok).toBe(false);
  });

  it("deletes a page once there is more than one", () => {
    const spec = unwrap(addPage(emptyForm, "Second"));
    const after = unwrap(removePage(spec, "page_1"));
    expect(after.steps).toHaveLength(1);
    expect(after.steps[0].title).toBe("Second");
  });

  it("refuses an empty page name", () => {
    expect(addPage(emptyForm, "   ").ok).toBe(false);
  });
});

describe("sections and fields", () => {
  it("builds the shape of the Client's Personal Details page", () => {
    let spec = unwrap(renamePage(emptyForm, "page_1", "Personal Details"));
    spec = unwrap(addField(spec, "page_1", 0, { label: "Full Name", required: true, type: "short_text" }));
    spec = unwrap(addField(spec, "page_1", 0, { label: "Date of Birth", required: true, type: "date" }));
    spec = unwrap(
      addField(spec, "page_1", 0, {
        label: "Gender",
        options: ["Male", "Female", "Other"],
        required: true,
        type: "select",
      }),
    );
    spec = unwrap(addSection(spec, "page_1", "Parent / Guardian Details"));
    spec = unwrap(addField(spec, "page_1", 1, { label: "Parent / Guardian Name", type: "short_text" }));

    expect(spec.steps[0].sections).toHaveLength(2);
    expect(spec.steps[0].sections[0].fields.map((f) => f.key)).toEqual([
      "full_name",
      "date_of_birth",
      "gender",
    ]);
    expect(spec.steps[0].sections[1].title).toBe("Parent / Guardian Details");
    expect(readyForStudents(spec).ready).toBe(true);
  });

  it("refuses a choice question with no options", () => {
    expect(addField(emptyForm, "page_1", 0, { label: "Gender", type: "select" }).ok).toBe(false);
  });

  it("refuses duplicate options", () => {
    const result = addField(emptyForm, "page_1", 0, {
      label: "Results out?",
      options: ["Yes", "Yes"],
      type: "radio",
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an unknown question type", () => {
    expect(addField(emptyForm, "page_1", 0, { label: "Signature", type: "signature" }).ok).toBe(false);
  });

  it("keeps a word limit only on a long answer", () => {
    const good = addField(emptyForm, "page_1", 0, { label: "Essay", type: "long_text", wordLimit: 200 });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.spec.steps[0].sections[0].fields[0].wordLimit).toBe(200);

    const ignored = addField(emptyForm, "page_1", 0, { label: "Name", type: "short_text", wordLimit: 200 });
    expect(ignored.ok).toBe(true);
    if (ignored.ok) expect(ignored.spec.steps[0].sections[0].fields[0].wordLimit).toBeUndefined();
  });

  it("refuses to delete the last section on a page", () => {
    expect(removeSection(emptyForm, "page_1", 0).ok).toBe(false);
  });

  it("removes a field by key", () => {
    let spec = unwrap(addField(emptyForm, "page_1", 0, { label: "Full Name", type: "short_text" }));
    spec = unwrap(addField(spec, "page_1", 0, { label: "City", type: "short_text" }));
    const after = unwrap(removeField(spec, "full_name"));
    expect(after.steps[0].sections[0].fields.map((f) => f.key)).toEqual(["city"]);
  });
});

describe("moveField", () => {
  function threeFields(): FormSpec {
    let spec = unwrap(addField(emptyForm, "page_1", 0, { label: "One", type: "short_text" }));
    spec = unwrap(addField(spec, "page_1", 0, { label: "Two", type: "short_text" }));
    return unwrap(addField(spec, "page_1", 0, { label: "Three", type: "short_text" }));
  }

  it("moves a question up and down within its section", () => {
    const spec = threeFields();
    const up = unwrap(moveField(spec, "three", "up"));
    expect(up.steps[0].sections[0].fields.map((f) => f.key)).toEqual(["one", "three", "two"]);
    const down = unwrap(moveField(up, "one", "down"));
    expect(down.steps[0].sections[0].fields.map((f) => f.key)).toEqual(["three", "one", "two"]);
  });

  it("refuses to move past either end rather than silently doing nothing", () => {
    const spec = threeFields();
    expect(moveField(spec, "one", "up").ok).toBe(false);
    expect(moveField(spec, "three", "down").ok).toBe(false);
  });

  it("never moves a question into another section", () => {
    // Conflating "up at the top of a section" with "move to the previous
    // section" relocates a question somewhere the admin was not looking.
    let spec = unwrap(addField(emptyForm, "page_1", 0, { label: "One", type: "short_text" }));
    spec = unwrap(addSection(spec, "page_1", "Second"));
    spec = unwrap(addField(spec, "page_1", 1, { label: "Two", type: "short_text" }));
    expect(moveField(spec, "two", "up").ok).toBe(false);
    expect(spec.steps[0].sections[1].fields.map((f) => f.key)).toEqual(["two"]);
  });
});

describe("readyForStudents", () => {
  it("is false while a section is still empty, and says why", () => {
    // A half-built form is a normal state to leave overnight, so the builder
    // warns rather than refusing the save. It is only a defect once a student
    // is looking at it.
    const spec = unwrap(addSection(emptyForm, "page_1", "Empty"));
    const verdict = readyForStudents(spec);
    expect(verdict.ready).toBe(false);
    expect(verdict.reason).toContain("at least one field");
  });

  it("is true once every section has a question", () => {
    const spec = unwrap(addField(emptyForm, "page_1", 0, { label: "Name", type: "short_text" }));
    expect(readyForStudents(spec).ready).toBe(true);
  });
});
