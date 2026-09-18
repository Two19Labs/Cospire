// The operations behind the round builder.
//
// Every click on that screen -- add a page, rename a section, move a field up --
// is one of these. They are pure functions from one form to another, so the
// builder cannot corrupt a round's config: an operation either returns a valid
// new form or an error, and the caller writes nothing on an error.
//
// Kept out of `actions/` because that directory is `server-only`, which Next.js
// resolves through a bundler alias rather than a real package, so anything
// importing it is unreachable from a unit test. These rules are exactly what a
// test should hold.

import {
  fieldTypes,
  maxFieldsPerStep,
  maxOptionsPerField,
  maxStepsPerForm,
  validateFormSpec,
  type FieldType,
  type FormField,
  type FormSpec,
  type FormStep,
} from "./form-schema";

export type BuildResult =
  | { ok: false; message: string }
  | { ok: true; spec: FormSpec };

export const emptyForm: FormSpec = {
  steps: [{ key: "page_1", title: "Page 1", sections: [{ fields: [] }] }],
};

// A label becomes a key once, when the field is created, and never again. The
// admin types "Full Name" and the answer is stored under `full_name`; renaming
// the label later must not orphan answers already given to it, which is why
// nothing here recomputes a key from a label after the fact.
export function toKey(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "f_$1")
      .slice(0, 40) || "field";

  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 500; suffix += 1) {
    const candidate = `${base}_${suffix}`.slice(0, 48);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`.slice(0, 48);
}

function clone(spec: FormSpec): FormSpec {
  return JSON.parse(JSON.stringify(spec)) as FormSpec;
}

function keysIn(spec: FormSpec): Set<string> {
  const keys = new Set<string>();
  for (const step of spec.steps) {
    keys.add(step.key);
    for (const section of step.sections) {
      for (const field of section.fields) keys.add(field.key);
    }
  }
  return keys;
}

// Every operation ends here. An operation that would produce a form the reader
// cannot parse is refused, so a bug in one of them surfaces as a refused click
// rather than as a round that silently resets itself.
//
// Empty sections are allowed, because a half-built form is a normal state to
// leave overnight. `readyForStudents` is the strict check, and the builder shows
// its verdict as a warning rather than refusing the save.
function settleAllowingEmpty(spec: FormSpec): BuildResult {
  const problems = validateFormSpec(spec, { allowEmptySections: true });
  if (problems.length > 0) return { ok: false, message: problems[0].message };
  return { ok: true, spec };
}

export function addPage(spec: FormSpec, title: string): BuildResult {
  const name = title.trim();
  if (!name) return { ok: false, message: "Give the page a name." };
  if (spec.steps.length >= maxStepsPerForm) {
    return { ok: false, message: `A form may have at most ${maxStepsPerForm} pages.` };
  }
  const next = clone(spec);
  const key = toKey(name, keysIn(spec));
  next.steps.push({ key, title: name, sections: [{ fields: [] }] });
  return settleAllowingEmpty(next);
}

export function renamePage(spec: FormSpec, stepKey: string, title: string): BuildResult {
  const name = title.trim();
  if (!name) return { ok: false, message: "Give the page a name." };
  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  if (!step) return { ok: false, message: "That page no longer exists." };
  step.title = name;
  return settleAllowingEmpty(next);
}

export function setPageSubtitle(spec: FormSpec, stepKey: string, subtitle: string): BuildResult {
  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  if (!step) return { ok: false, message: "That page no longer exists." };
  const text = subtitle.trim();
  if (text) step.subtitle = text;
  else delete step.subtitle;
  return settleAllowingEmpty(next);
}

export function removePage(spec: FormSpec, stepKey: string): BuildResult {
  if (spec.steps.length <= 1) {
    // Deleting the last page leaves a form with nothing in it, which the student
    // renderer would show as "nothing to fill in".
    return { ok: false, message: "A form needs at least one page." };
  }
  const next = clone(spec);
  next.steps = next.steps.filter((entry) => entry.key !== stepKey);
  if (next.steps.length === spec.steps.length) {
    return { ok: false, message: "That page no longer exists." };
  }
  return settleAllowingEmpty(next);
}

export function addSection(spec: FormSpec, stepKey: string, title: string): BuildResult {
  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  if (!step) return { ok: false, message: "That page no longer exists." };
  const name = title.trim();
  step.sections.push(name ? { fields: [], title: name } : { fields: [] });
  return settleAllowingEmpty(next);
}

export function renameSection(
  spec: FormSpec,
  stepKey: string,
  sectionIndex: number,
  title: string,
): BuildResult {
  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  const section = step?.sections[sectionIndex];
  if (!section) return { ok: false, message: "That section no longer exists." };
  const name = title.trim();
  if (name) section.title = name;
  else delete section.title;
  return settleAllowingEmpty(next);
}

export function removeSection(spec: FormSpec, stepKey: string, sectionIndex: number): BuildResult {
  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  if (!step || !step.sections[sectionIndex]) {
    return { ok: false, message: "That section no longer exists." };
  }
  if (step.sections.length <= 1) {
    return { ok: false, message: "A page needs at least one section." };
  }
  step.sections.splice(sectionIndex, 1);
  return settleAllowingEmpty(next);
}

export interface NewFieldInput {
  helpText?: string;
  label: string;
  options?: string[];
  required?: boolean;
  type: string;
  wordLimit?: number | null;
}

export function addField(
  spec: FormSpec,
  stepKey: string,
  sectionIndex: number,
  input: NewFieldInput,
): BuildResult {
  const label = input.label.trim();
  if (!label) return { ok: false, message: "Give the question a label." };
  if (!fieldTypes.includes(input.type as FieldType)) {
    return { ok: false, message: "Choose a question type." };
  }

  const next = clone(spec);
  const step = next.steps.find((entry) => entry.key === stepKey);
  const section = step?.sections[sectionIndex];
  if (!step || !section) return { ok: false, message: "That section no longer exists." };

  const fieldCount = step.sections.reduce((sum, entry) => sum + entry.fields.length, 0);
  if (fieldCount >= maxFieldsPerStep) {
    return { ok: false, message: `A page may hold at most ${maxFieldsPerStep} questions.` };
  }

  const type = input.type as FieldType;
  const field: FormField = { key: toKey(label, keysIn(spec)), label, type };
  if (input.required) field.required = true;
  if (input.helpText?.trim()) field.helpText = input.helpText.trim();

  if (["radio", "score_list", "select", "single_choice"].includes(type)) {
    const options = (input.options ?? []).map((entry) => entry.trim()).filter(Boolean);
    if (options.length === 0) return { ok: false, message: "That question type needs options." };
    if (options.length > maxOptionsPerField) {
      return { ok: false, message: `A question may offer at most ${maxOptionsPerField} options.` };
    }
    if (new Set(options).size !== options.length) {
      return { ok: false, message: "Options must be distinct." };
    }
    field.options = options;
  }

  if (type === "long_text" && input.wordLimit) {
    if (!Number.isSafeInteger(input.wordLimit) || input.wordLimit <= 0) {
      return { ok: false, message: "A word limit must be a positive whole number." };
    }
    field.wordLimit = input.wordLimit;
  }

  section.fields.push(field);
  return settleAllowingEmpty(next);
}

export function removeField(spec: FormSpec, fieldKey: string): BuildResult {
  const next = clone(spec);
  let found = false;
  for (const step of next.steps) {
    for (const section of step.sections) {
      const index = section.fields.findIndex((field) => field.key === fieldKey);
      if (index !== -1) {
        section.fields.splice(index, 1);
        found = true;
      }
    }
  }
  if (!found) return { ok: false, message: "That question no longer exists." };
  return settleAllowingEmpty(next);
}

// Moves a field within its own section only. Moving between sections is a
// different operation and a different intent; conflating them means a click on
// "up" at the top of a section silently relocates the question somewhere the
// admin was not looking.
export function moveField(spec: FormSpec, fieldKey: string, direction: "down" | "up"): BuildResult {
  const next = clone(spec);
  for (const step of next.steps) {
    for (const section of step.sections) {
      const index = section.fields.findIndex((field) => field.key === fieldKey);
      if (index === -1) continue;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= section.fields.length) {
        return { ok: false, message: "That question is already at the end." };
      }
      const [moved] = section.fields.splice(index, 1);
      section.fields.splice(target, 0, moved);
      return settleAllowingEmpty(next);
    }
  }
  return { ok: false, message: "That question no longer exists." };
}

// True when the form is fit to show a student: the check `settleAllowingEmpty`
// deliberately skips. The builder shows this as a warning rather than refusing
// the save, because a half-built form is a normal state to leave overnight.
export function readyForStudents(spec: FormSpec): { ready: boolean; reason?: string } {
  const problems = validateFormSpec(spec);
  if (problems.length === 0) return { ready: true };
  return { ready: false, reason: problems[0].message };
}

export function countFields(spec: FormSpec): number {
  return spec.steps.reduce(
    (sum, step: FormStep) =>
      sum + step.sections.reduce((inner, section) => inner + section.fields.length, 0),
    0,
  );
}
