// Validation for everything an admin types about an ARS round.
//
// The bounds match the check constraints in `20260910144415_ars_rounds.sql` and
// its correction in `20260910144803`. The database is the enforcer; this exists
// so an admin gets a sentence they can act on instead of a constraint violation.

export const roundSubmissionModes = ["text", "file", "form", "offline"] as const;

export type RoundSubmissionMode = (typeof roundSubmissionModes)[number];

// What each mode means, in the words the admin sees. Kept beside the validation
// rather than in the component, so the list and the rules cannot drift.
//
// `offline` exists because interviews, group discussions and guesstimates are
// two-way and happen elsewhere -- Annexure B excludes live features from this
// platform. The round still belongs in the sequence so the student can see the
// step and its date; the mentor records the outcome afterwards.
export const roundSubmissionModeLabels: Record<RoundSubmissionMode, string> = {
  file: "A file upload, such as a video essay",
  form: "A set of written answers to named questions",
  offline: "Nothing here — it happens on a call, and the mentor records it",
  text: "One written answer",
};

// Dates are typed as a day, not an instant: an admin setting a deadline means
// the end of that day, in their own time zone.
//
// IST is applied as a fixed offset rather than through an `Intl` time-zone
// lookup, for the reason recorded when the document watermark read UTC: a
// runtime with trimmed ICU data falls back to UTC while still printing "IST",
// which is a wrong answer that looks right. Vercel runs on UTC.
const istOffset = "+05:30";

export function parseRoundDay(
  raw: unknown,
  edge: "start" | "end",
): string | null | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;

  const time = edge === "start" ? "00:00:00" : "23:59:59";
  const parsed = new Date(`${raw}T${time}${istOffset}`);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}

export const roundNameMaxLength = 200;
export const roundPromptMaxLength = 4000;
export const roundFieldLabelMaxLength = 200;
export const roundMaxFields = 30;

export interface RoundField {
  label: string;
}

export interface RoundConfig {
  // Legacy, still read so rounds authored before the builder keep working.
  fields?: RoundField[];
  prompt: string;
  // What the builder writes. Typed loosely here because `form-schema.ts` owns
  // the real shape and validates it; duplicating that type invites the two
  // drifting apart.
  steps?: unknown[];
}

export interface NewRoundFieldErrors {
  dates?: string;
  fields?: string;
  name?: string;
  prompt?: string;
  submissionMode?: string;
}

export interface NewRoundValue {
  config: RoundConfig;
  dueAt: string | null;
  name: string;
  opensAt: string | null;
  requiresReview: boolean;
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
  dueAt?: unknown;
  fields: unknown;
  name: unknown;
  opensAt?: unknown;
  requiresReview?: unknown;
  prompt: unknown;
  submissionMode: unknown;
}): NewRoundValidation {
  const errors: NewRoundFieldErrors = {};

  const opensAt = parseRoundDay(input.opensAt, "start");
  const dueAt = parseRoundDay(input.dueAt, "end");

  if (opensAt === undefined || dueAt === undefined) {
    errors.dates = "Enter dates as a day, or leave them empty.";
  } else if (opensAt && dueAt && dueAt < opensAt) {
    // The same rule the ars_rounds_dates_ordered constraint enforces. Caught
    // here so the admin gets a sentence rather than a constraint violation.
    errors.dates = "The deadline cannot fall before the opening date.";
  }

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
    // No longer required. Since the round builder landed on 2026-09-18 a form
    // round is created empty and composed afterwards, with pages, sections and
    // a type per question. Demanding the questions up front made the builder
    // unreachable -- the round could not exist without already having what the
    // builder is for. The field stays as a quick start for a simple round.
    if (labels.length > roundMaxFields) {
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
      // A form round is always written in the builder's own shape, so opening
      // it in the builder needs no conversion step. Anything typed into the
      // quick-start box becomes the first page's questions; an empty box gives
      // an empty first page, which the builder then fills.
      config:
        submissionMode === "form"
          ? {
              prompt,
              steps: [
                {
                  key: "page_1",
                  sections: [
                    {
                      fields: labels.map((label, index) => ({
                        key: `field_${index + 1}`,
                        label,
                        required: true,
                        type: "short_text",
                      })),
                    },
                  ],
                  title: "Page 1",
                },
              ],
            }
          : { prompt },
      dueAt: dueAt ?? null,
      name,
      opensAt: opensAt ?? null,
      // An unticked checkbox sends nothing at all, so absence is false. An
      // application round is practice and nobody reads it; an essay is.
      requiresReview: input.requiresReview === "on" || input.requiresReview === true,
      submissionMode,
    },
  };
}

// A stored instant, shown back as the day an admin meant.
//
// Fixed offset rather than an `Intl` time-zone lookup, for the same reason
// `composeWatermark` avoids one: a runtime with trimmed ICU data falls back to
// UTC while still printing "IST". Vercel runs on UTC.
const istOffsetMinutes = 5 * 60 + 30;

export function formatRoundDay(raw: string | null): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getTime() + istOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}
