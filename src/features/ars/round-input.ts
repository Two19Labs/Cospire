// Validation for everything an admin types about an ARS round.
//
// The bounds match the check constraints in `20260910144415_ars_rounds.sql` and
// its correction in `20260910144803`. The database is the enforcer; this exists
// so an admin gets a sentence they can act on instead of a constraint violation.

export const roundSubmissionModes = ["text", "file", "form"] as const;

export type RoundSubmissionMode = (typeof roundSubmissionModes)[number];

// What each mode means, in the words the admin sees. Kept beside the validation
// rather than in the component, so the list and the rules cannot drift.
export const roundSubmissionModeLabels: Record<RoundSubmissionMode, string> = {
  file: "A file upload, such as a video essay",
  form: "A set of written answers to named questions",
  text: "One written answer",
};

export const roundNameMaxLength = 200;
export const roundPromptMaxLength = 4000;
export const roundFieldLabelMaxLength = 200;
export const roundMaxFields = 30;

export interface RoundField {
  label: string;
}

export interface RoundConfig {
  fields?: RoundField[];
  prompt: string;
}

export interface NewRoundFieldErrors {
  fields?: string;
  name?: string;
  prompt?: string;
  submissionMode?: string;
}

export interface NewRoundValue {
  config: RoundConfig;
  name: string;
  submissionMode: RoundSubmissionMode;
}

export interface NewRoundValidation {
  errors: NewRoundFieldErrors;
  value: NewRoundValue | null;
}

function isSubmissionMode(raw: unknown): raw is RoundSubmissionMode {
  return (
    typeof raw === "string" &&
    (roundSubmissionModes as readonly string[]).includes(raw)
  );
}

// Field labels are authored one per line.
//
// A repeating add-a-field control needs JavaScript, and every form in this
// application works without it. A textarea is the shape that survives scripting
// being off, and it is also how someone would write the list down anyway.
export function parseFieldLabels(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function validateNewRound(input: {
  fields: unknown;
  name: unknown;
  prompt: unknown;
  submissionMode: unknown;
}): NewRoundValidation {
  const errors: NewRoundFieldErrors = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    errors.name = "Give the round a name.";
  } else if (name.length > roundNameMaxLength) {
    errors.name = `Use at most ${roundNameMaxLength} characters.`;
  }

  if (!isSubmissionMode(input.submissionMode)) {
    errors.submissionMode = "Choose what the student submits.";
  }

  // Required, unlike the ordering that was dropped from the programme form. A
  // round with no instructions is a page that asks the student to guess.
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) {
    errors.prompt = "Tell the student what to do.";
  } else if (prompt.length > roundPromptMaxLength) {
    errors.prompt = `Use at most ${roundPromptMaxLength} characters.`;
  }

  const labels = parseFieldLabels(input.fields);

  if (input.submissionMode === "form") {
    if (labels.length === 0) {
      errors.fields = "Add at least one question, one per line.";
    } else if (labels.length > roundMaxFields) {
      errors.fields = `Use at most ${roundMaxFields} questions.`;
    } else if (labels.some((label) => label.length > roundFieldLabelMaxLength)) {
      errors.fields = `Keep each question under ${roundFieldLabelMaxLength} characters.`;
    } else if (new Set(labels).size !== labels.length) {
      // Two identical questions are indistinguishable in the student's answers,
      // and the answer keyed by label would silently collide.
      errors.fields = "Each question must be different.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  const submissionMode = input.submissionMode as RoundSubmissionMode;

  return {
    errors,
    value: {
      // `fields` is written only for `form`. Carrying an empty array on the
      // other modes would suggest the shape supports questions when the student
      // route will never read them.
      config:
        submissionMode === "form"
          ? { fields: labels.map((label) => ({ label })), prompt }
          : { prompt },
      name,
      submissionMode,
    },
  };
}
