import { countWords, type FormField } from "./form-schema";

// What a student may post for one question, checked on the server.
//
// Pure, for the same reason `form-schema.ts` is: the action that calls this is
// `"use server"` and cannot be reached from a unit test, and this is the part
// that decides whether a real answer is accepted.

export type ReadResult = { error?: string; value?: unknown };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An Indian mobile number: ten digits starting 6 to 9, after dropping spaces,
// dashes, brackets and a leading +91, 91 or 0.
export function normalisePhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// A school result read against the marking scheme chosen beside it.
// ponytail: knows the three scheme names the Masters' Union form offers; any
// other scheme, or none chosen yet, accepts the result as written.
export function checkResult(scheme: string, text: string): string | null {
  if (scheme === "Percentage" || scheme === "CGPA") {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
    const value = Number.parseFloat(text);
    return value <= (scheme === "CGPA" ? 10 : 100) ? text : null;
  }
  if (scheme === "Grades") {
    return /^[A-Za-z][A-Za-z0-9+-]{0,3}$/.test(text) ? text.toUpperCase() : null;
  }
  return text;
}

// India's date, because a student born today in Mumbai is not "in the future"
// at 1am IST while Vercel's clock still reads yesterday.
function todayInIndia(now: Date): string {
  return new Date(now.getTime() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);
}

function inRange(field: FormField, value: number): boolean {
  return (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
}

// Returns `undefined` for "not answered", which is stored as absent rather than
// as "".
export function readAnswer(
  get: (name: string) => FormDataEntryValue | null,
  field: FormField,
  now: Date = new Date(),
): ReadResult {
  if (field.type === "score_list") {
    // The Masters' Union pattern: a tick and a score per exam.
    const out: Record<string, string> = {};
    for (const option of field.options ?? []) {
      const raw = get(`${field.key}::${option}`);
      if (typeof raw === "string" && raw.trim().length > 0) {
        if (raw.trim().length > 40) return { error: "too-long" };
        out[option] = raw.trim();
      }
    }
    return { value: Object.keys(out).length ? out : undefined };
  }

  if (field.type === "checkbox") {
    // An unticked box is absent from the body entirely, so presence is the test.
    return { value: get(field.key) !== null };
  }

  const raw = get(field.key);
  if (typeof raw !== "string") return { value: undefined };
  const text = raw.trim();
  if (text.length === 0) return { value: undefined };

  if (field.type === "long_text") {
    if (field.wordLimit && countWords(text) > field.wordLimit) return { error: "too-many-words" };
    if (text.length > 20000) return { error: "too-long" };
    return { value: text };
  }

  if (text.length > 2000) return { error: "too-long" };

  if (field.type === "number") {
    if (!/^-?\d{1,9}(\.\d{1,4})?$/.test(text)) return { error: "not-a-number" };
    const value = Number.parseFloat(text);
    if (!inRange(field, value)) return { error: "out-of-range" };
    return { value };
  }

  if (field.type === "date") {
    // Refused here rather than sent to Postgres to fail as a type error.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) {
      return { error: "bad-date" };
    }
    if (field.pastOnly && text > todayInIndia(now)) return { error: "future-date" };
    return { value: text };
  }

  if (field.type === "month_year") {
    // `<input type="month">` posts YYYY-MM; a browser without it shows a text
    // box with that placeholder.
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(text);
    if (!match) return { error: "bad-month" };
    if (!inRange(field, Number(match[1]))) return { error: "out-of-range" };
    return { value: text };
  }

  if (field.type === "select" || field.type === "radio" || field.type === "single_choice") {
    // The posted value must be one the round actually offers. Without this a
    // hand-posted body could store a course preference that does not exist.
    if (!(field.options ?? []).includes(text)) return { error: "not-an-option" };
    return { value: text };
  }

  if (field.format === "email") {
    return emailPattern.test(text) ? { value: text.toLowerCase() } : { error: "bad-email" };
  }
  if (field.format === "phone") {
    const phone = normalisePhone(text);
    return phone ? { value: phone } : { error: "bad-phone" };
  }
  if (field.scoredBy) {
    const scheme = get(field.scoredBy);
    const result = checkResult(typeof scheme === "string" ? scheme : "", text);
    return result === null ? { error: "bad-result" } : { value: result };
  }

  return { value: text };
}
