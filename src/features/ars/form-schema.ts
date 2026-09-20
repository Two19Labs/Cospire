// The shape of a multi-step ARS form, and the rules that decide whether one is
// valid.
//
// This replaces the flat `{ fields: [...] }` that `ars_rounds.config` carried
// until now. That was enough for "ask the student three questions" and is not
// close to enough for a real admission application: the Client's own Masters'
// Union form has four steps, sections inside each step, eight field types, a
// word-limited essay and fields that appear only in answer to another field.
//
// The point of putting this in `config` rather than in code is the promise in
// Annexure A that admins add further round types over time, and the founder's
// own words about the report -- "we'd want the option to build it, because it
// can change". Masters' Union's application is data. Ashoka's is different data.
// Neither needs a developer.
//
// Pure and dependency-free on purpose: `queries/` and `actions/` are
// `server-only`, which Next.js resolves through a bundler alias rather than a
// real package, so anything importing them cannot be reached from a unit test.
// This is the part worth testing.

export type FieldType =
  | "checkbox"
  | "date"
  | "file"
  | "long_text"
  | "month_year"
  | "number"
  | "radio"
  | "score_list"
  | "select"
  | "short_text"
  | "single_choice";

// A value the server fills in and the student cannot change: their own email and
// phone are already known, and asking again invites a typo that makes the
// account and the application disagree about who the applicant is.
export type PrefillSource = "email" | "name" | "phone";

export interface FormField {
  // Stable across edits to the label, because it is the key the answer is stored
  // under. Renaming a question must not orphan the answers already given to it.
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  // `select`, `radio`, `single_choice` and `score_list`.
  options?: string[];
  // `long_text` only. The founder asked for configurable word limits on every
  // written input; the student screen shows a live count against this.
  wordLimit?: number;
  maxLength?: number;
  prefill?: PrefillSource;
  // `file` only, as a list of extensions without the dot.
  accept?: string[];
}

export interface FormSection {
  title?: string;
  description?: string;
  fields: FormField[];
}

export interface FormStep {
  // Stable for the same reason a field key is: it identifies which step a
  // partially-filled draft had reached.
  key: string;
  title: string;
  subtitle?: string;
  // A step the student may pass without answering anything, like the optional
  // exam scores on the Masters' Union form.
  optional?: boolean;
  sections: FormSection[];
}

export interface FormSpec {
  steps: FormStep[];
}

export const fieldTypes: FieldType[] = [
  "checkbox",
  "date",
  "file",
  "long_text",
  "month_year",
  "number",
  "radio",
  "score_list",
  "select",
  "short_text",
  "single_choice",
];

// Types that are meaningless without something to choose from. A `select` with
// no options renders an empty dropdown, which is a page asking the student to
// pick nothing -- the same failure `ars_rounds_form_has_fields` exists to stop
// at the round level.
const typesNeedingOptions: FieldType[] = ["radio", "score_list", "select", "single_choice"];
const allowedFileExtensions = ["jpg", "mov", "mp4", "pdf", "png", "webm"];

export const maxStepsPerForm = 12;
export const maxFieldsPerStep = 60;
export const maxOptionsPerField = 60;

// A key is referenced in stored answers and in HTML `name` attributes, so it is
// deliberately narrow rather than "any string that happens to work today".
const keyPattern = /^[a-z][a-z0-9_]{0,48}$/;

export interface SpecProblem {
  message: string;
  where: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkField(raw: unknown, where: string, problems: SpecProblem[], seen: Set<string>): void {
  if (!isRecord(raw)) {
    problems.push({ message: "A field must be an object.", where });
    return;
  }

  const key = raw.key;
  if (typeof key !== "string" || !keyPattern.test(key)) {
    problems.push({
      message: "A field key must be lower case letters, digits and underscores, starting with a letter.",
      where,
    });
  } else if (seen.has(key)) {
    // Two fields sharing a key would silently overwrite one another's answer.
    problems.push({ message: `Two fields share the key "${key}".`, where });
  } else {
    seen.add(key);
  }

  if (typeof raw.label !== "string" || raw.label.trim().length === 0) {
    problems.push({ message: "A field needs a label.", where });
  }

  const type = raw.type;
  if (typeof type !== "string" || !fieldTypes.includes(type as FieldType)) {
    problems.push({ message: `"${String(type)}" is not a field type we can render.`, where });
    return;
  }

  const options = raw.options;
  if (typesNeedingOptions.includes(type as FieldType)) {
    if (!Array.isArray(options) || options.length === 0) {
      problems.push({ message: `A "${type}" field needs at least one option.`, where });
    } else if (options.length > maxOptionsPerField) {
      problems.push({ message: `A field may offer at most ${maxOptionsPerField} options.`, where });
    } else if (!options.every((entry) => typeof entry === "string" && entry.trim().length > 0)) {
      problems.push({ message: "Every option must be a non-empty label.", where });
    } else if (new Set(options).size !== options.length) {
      problems.push({ message: "Options must be distinct.", where });
    }
  }

  if (raw.wordLimit !== undefined) {
    if (type !== "long_text") {
      problems.push({ message: "A word limit only applies to a long answer.", where });
    } else if (
      typeof raw.wordLimit !== "number" ||
      !Number.isSafeInteger(raw.wordLimit) ||
      raw.wordLimit <= 0
    ) {
      problems.push({ message: "A word limit must be a positive whole number.", where });
    }
  }

  if (raw.prefill !== undefined && !["email", "name", "phone"].includes(String(raw.prefill))) {
    problems.push({ message: "A prefill source must be email, name or phone.", where });
  }

  if (raw.accept !== undefined && type !== "file") {
    problems.push({ message: "Accepted file types only apply to a file field.", where });
  } else if (
    type === "file" &&
    raw.accept !== undefined &&
    (!Array.isArray(raw.accept) ||
      raw.accept.length === 0 ||
      !raw.accept.every((entry) => typeof entry === "string" && allowedFileExtensions.includes(entry)))
  ) {
    problems.push({ message: "Accepted file types must be PDF, MP4, MOV, WEBM, JPG or PNG.", where });
  }
}

export interface ValidateOptions {
  // A form being BUILT legitimately has an empty section: the admin has just
  // added one and has not put a question in it yet. A form shown to a STUDENT
  // must not, because it renders as a heading with nothing under it.
  //
  // Reading stored config is lenient and rendering is strict. Getting this the
  // wrong way round cost a real bug on 2026-09-18: `toFormSpec` validated
  // strictly, so the moment an admin added a section the stored form failed to
  // parse, every caller fell back to the empty form, and the whole thing
  // silently reverted to "Page 1".
  allowEmptySections?: boolean;
}

// Returns every problem rather than the first, because an admin fixing a form
// one error per save is an admin who stops using the feature.
export function validateFormSpec(raw: unknown, options: ValidateOptions = {}): SpecProblem[] {
  const problems: SpecProblem[] = [];

  if (!isRecord(raw)) {
    return [{ message: "A form must be an object with a steps list.", where: "form" }];
  }

  const steps = raw.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{ message: "A form needs at least one step.", where: "form" }];
  }
  if (steps.length > maxStepsPerForm) {
    problems.push({ message: `A form may have at most ${maxStepsPerForm} steps.`, where: "form" });
  }

  const stepKeys = new Set<string>();
  const fieldKeys = new Set<string>();

  steps.forEach((step, stepIndex) => {
    const where = `step ${stepIndex + 1}`;
    if (!isRecord(step)) {
      problems.push({ message: "A step must be an object.", where });
      return;
    }

    const key = step.key;
    if (typeof key !== "string" || !keyPattern.test(key)) {
      problems.push({ message: "A step key must be lower case letters, digits and underscores.", where });
    } else if (stepKeys.has(key)) {
      problems.push({ message: `Two steps share the key "${key}".`, where });
    } else {
      stepKeys.add(key);
    }

    if (typeof step.title !== "string" || step.title.trim().length === 0) {
      problems.push({ message: "A step needs a title.", where });
    }

    const sections = step.sections;
    if (!Array.isArray(sections) || sections.length === 0) {
      problems.push({ message: "A step needs at least one section.", where });
      return;
    }

    let fieldCount = 0;
    sections.forEach((section, sectionIndex) => {
      const sectionWhere = `${where}, section ${sectionIndex + 1}`;
      if (!isRecord(section)) {
        problems.push({ message: "A section must be an object.", where: sectionWhere });
        return;
      }
      const fields = section.fields;
      if (!Array.isArray(fields)) {
        problems.push({ message: "A section needs at least one field.", where: sectionWhere });
        return;
      }
      if (fields.length === 0) {
        if (!options.allowEmptySections) {
          problems.push({ message: "A section needs at least one field.", where: sectionWhere });
        }
        return;
      }
      fieldCount += fields.length;
      fields.forEach((field, fieldIndex) => {
        // Field keys are unique across the WHOLE form, not per step, because the
        // answers are stored in one flat object per submission.
        checkField(field, `${sectionWhere}, field ${fieldIndex + 1}`, problems, fieldKeys);
      });
    });

    if (fieldCount > maxFieldsPerStep) {
      problems.push({ message: `A step may hold at most ${maxFieldsPerStep} fields.`, where });
    }
  });

  return problems;
}

// Lenient on purpose: this reads config back out of the database, where a
// half-built form is a normal state. Strictness belongs at the point a student
// is shown the form, which is `readyForStudents`.
export function isFormSpec(raw: unknown): raw is FormSpec {
  return validateFormSpec(raw, { allowEmptySections: true }).length === 0;
}

// Counts words the way a reader would, so the number under the box matches what
// the student believes they have written. Splitting on whitespace alone counts a
// trailing newline as a word.
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function stepProgress({ stepCount, stepIndex }: { stepCount: number; stepIndex: number }): number {
  if (stepCount <= 0) return 0;
  const clamped = Math.min(Math.max(stepIndex, 0), stepCount);
  return Math.round((clamped / stepCount) * 100);
}

// --------------------------------------------------------------------------
// Reading whatever a round actually carries
// --------------------------------------------------------------------------

export type RoundMode = "file" | "form" | "offline" | "text";

// Rounds authored before this format existed carry `{ prompt, fields: [{label}] }`,
// and rounds authored after it carry `{ steps: [...] }`. Both are live in the
// same table and neither may break, so this normalises whatever is there into
// one shape the renderer understands.
//
// Returning null is meaningful rather than an error: an `offline` round has no
// form at all. It happens somewhere else and the student is shown its dates.
export function toFormSpec(config: unknown, mode: RoundMode): FormSpec | null {
  if (mode === "offline") return null;

  const record = isRecord(config) ? config : {};
  const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";

  // The current format, authored against this schema.
  if (Array.isArray(record.steps)) {
    return isFormSpec(record) ? (record as unknown as FormSpec) : null;
  }

  if (mode === "text") {
    return {
      steps: [
        {
          key: "response",
          title: "Your answer",
          subtitle: prompt || undefined,
          sections: [
            {
              fields: [
                {
                  key: "response",
                  label: prompt || "Your answer",
                  type: "long_text",
                  required: true,
                  ...(typeof record.wordLimit === "number" ? { wordLimit: record.wordLimit } : {}),
                },
              ],
            },
          ],
        },
      ],
    };
  }

  if (mode === "file") {
    return {
      steps: [
        {
          key: "upload",
          title: "Your upload",
          subtitle: prompt || undefined,
          sections: [
            {
              fields: [
                {
                  key: "upload",
                  label: prompt || "Upload your file",
                  type: "file",
                  required: true,
                  accept: ["pdf", "mp4", "mov", "webm", "jpg", "png"],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  // Legacy `form`: a flat list of labels, with no keys of its own. Keys are
  // derived from position, which is stable as long as nobody reorders the
  // labels -- the reason the current format demands explicit keys.
  const legacyFields = Array.isArray(record.fields) ? record.fields : [];
  const fields: FormField[] = legacyFields
    .map((entry, index): FormField | null => {
      const label = isRecord(entry) && typeof entry.label === "string" ? entry.label.trim() : "";
      return label ? { key: `field_${index + 1}`, label, type: "short_text", required: true } : null;
    })
    .filter((entry): entry is FormField => entry !== null);

  if (fields.length === 0) return null;

  return {
    steps: [{ key: "form", title: "Your answers", subtitle: prompt || undefined, sections: [{ fields }] }],
  };
}

// Every field in a spec, flattened in render order. The renderer needs this to
// decide which posted values belong to the step being saved.
export function fieldsForStep(step: FormStep): FormField[] {
  return step.sections.flatMap((section) => section.fields);
}

export function allFields(spec: FormSpec): FormField[] {
  return spec.steps.flatMap(fieldsForStep);
}
