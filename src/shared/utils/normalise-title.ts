// A name or title an admin or mentor typed, tidied before it is saved: trimmed,
// internal runs of whitespace collapsed to one space, and the first letter
// upper-cased. Nothing else changes, so "iPMAT prep" becomes "IPMAT prep" and
// "IIM Indore" stays as it is. A first character that is not a lower-case
// letter -- a digit, a symbol, an upper-case letter -- is left alone.
//
// Server-side by design (operating manual §9.10): called from the server
// actions that save a short name or title, never only in the browser. It is
// for short labels only -- never emails, passwords, question text, answers,
// instructions, feedback or anything inside JSON config.
//
// Placed in src/shared/utils with the owner's authorisation (2026-10-10),
// because nine features save titles and each would otherwise grow its own.
export function normaliseTitle(value: string): string {
  const tidy = value.trim().replace(/\s+/g, " ");
  const first = String.fromCodePoint(tidy.codePointAt(0) ?? 0);
  if (!tidy || !/\p{Ll}/u.test(first)) return tidy;
  const upper = first.toUpperCase();
  // "ß" upper-cases to "SS"; a capital that changes the length is not the
  // small fix this is for, so such a letter is left as typed.
  if (Array.from(upper).length !== 1) return tidy;
  return upper + tidy.slice(first.length);
}
