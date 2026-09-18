// Validation for report-template authoring.
//
// Pure, and kept out of `queries/` and `actions/` for the reason the rounds
// feature gives: those modules are `server-only`, which Next.js resolves through
// a bundler alias rather than a real package, so anything importing them is
// unreachable from a unit test. The rules below are the part worth testing.
//
// Every function here runs against a Server Action's input. A Server Action is a
// public HTTP endpoint and TypeScript's parameter types are erased at that
// boundary, so nothing may assume a field arrived from the form that renders it.

export const templateNameMaxLength = 120;
export const componentTitleMaxLength = 120;
export const metricLabelMaxLength = 40;
export const vocabularyItemMaxLength = 40;
export const metricNameMaxLength = 80;

// A template with more than this many components, or a vocabulary longer than
// this, is a data-entry mistake rather than a real report. The Client's own
// sample carries five components and three or four tags.
export const maxComponents = 20;
export const maxVocabularyItems = 20;
export const maxMetricNames = 20;

function asText(raw: FormDataEntryValue | null): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function validateTemplateName(raw: FormDataEntryValue | null): string | null {
  const name = asText(raw);
  if (!name || name.length > templateNameMaxLength) return null;
  return name;
}

export function validateComponentTitle(raw: FormDataEntryValue | null): string | null {
  const title = asText(raw);
  if (!title || title.length > componentTitleMaxLength) return null;
  return title;
}

export function validateMetricLabel(raw: FormDataEntryValue | null): string | null {
  const label = asText(raw);
  // Defaulted rather than refused: the column heading is the least important
  // thing an admin is doing on this screen, and "Metric" is right four times out
  // of five in the Client's own report.
  if (!label) return "Metric";
  if (label.length > metricLabelMaxLength) return null;
  return label;
}

// A weightage is a percentage with at most two decimals, matching the
// numeric(5,2) column. Zero is refused because a component that cannot affect
// the total is a component that should not be in the table -- the same rule the
// database enforces, restated here so the admin gets a sentence rather than a
// constraint name.
export function validateWeightage(raw: FormDataEntryValue | null): number | null {
  const text = asText(raw);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  // Rounded to the column's own precision so the figure the admin sees back is
  // the figure stored, rather than one Postgres quietly rounded for them.
  return Math.round(value * 100) / 100;
}

// One item per line, or comma separated, because an admin pasting from the
// Client's report will do either. Blank entries are dropped rather than refused:
// a trailing comma is a typo, not an error worth a round trip.
export function parseList(
  raw: FormDataEntryValue | null,
  { maxItemLength, maxItems }: { maxItemLength: number; maxItems: number },
): string[] | null {
  const text = typeof raw === "string" ? raw : "";
  const items = text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (items.length > maxItems) return null;
  if (items.some((entry) => entry.length > maxItemLength)) return null;

  // Duplicates would render twice and, in a vocabulary, offer the same word
  // twice in one dropdown.
  return [...new Set(items)];
}

export function parseVocabulary(raw: FormDataEntryValue | null): string[] | null {
  return parseList(raw, {
    maxItemLength: vocabularyItemMaxLength,
    maxItems: maxVocabularyItems,
  });
}

export function parseMetricNames(raw: FormDataEntryValue | null): string[] | null {
  return parseList(raw, {
    maxItemLength: metricNameMaxLength,
    maxItems: maxMetricNames,
  });
}

// An unticked checkbox is absent from the form data entirely, which is why this
// tests for presence rather than for a value. A hand-posted "false" must not
// read as true.
export function parseFlag(raw: FormDataEntryValue | null): boolean {
  return raw === "on" || raw === "true" || raw === "1";
}

// An id arrives from a form field or a URL segment. It is a bigint in the
// database, so anything that is not a positive whole number is refused here
// rather than sent to Postgres to fail as a type error.
export function parseId(raw: FormDataEntryValue | string | null | undefined): number | null {
  const text = typeof raw === "string" ? raw : "";
  if (!/^[0-9]{1,18}$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// Optional, because a component need not belong to a round at all. Four of the
// five components in the Client's sample map onto a round; "Profile & Content"
// does not, because no round exists in which a student submits a profile.
export function parseOptionalId(raw: FormDataEntryValue | null): { ok: boolean; value: number | null } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: true, value: null };
  const parsed = parseId(text);
  return parsed === null ? { ok: false, value: null } : { ok: true, value: parsed };
}

// Orders a set of weightage changes so the running total never rises above 100
// at any intermediate step.
//
// This exists because of a real constraint of the REST boundary rather than a
// preference. `ars_report_template_components_weightage_total` is DEFERRABLE
// INITIALLY DEFERRED, so several changes inside ONE transaction are judged only
// on their final total. PostgREST commits each request separately, so a screen
// that sends one update per component is several transactions, and a rebalance
// of A 40->60 with B 60->40 is refused if the raise is applied first: 60 + 60 is
// 120 at that moment, even though the end state is legal.
//
// Applying every decrease before any increase makes the total monotonically
// non-increasing until the last step, so no intermediate state can exceed 100
// whenever the final state does not.
export function orderWeightageChanges<T extends { current: number; id: number; next: number }>(
  changes: T[],
): T[] {
  const changed = changes.filter((entry) => entry.next !== entry.current);
  const decreases = changed.filter((entry) => entry.next < entry.current);
  const increases = changed.filter((entry) => entry.next > entry.current);
  return [...decreases, ...increases];
}
