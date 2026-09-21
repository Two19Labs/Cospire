// Reading a typed numerical answer (TITA), and deciding whether it is right.
//
// Operating manual §11 puts this first in the phase, for a reason worth
// keeping in view: a correct answer marked wrong destroys the Client's
// confidence faster than any other defect. So a student who types ".50" for an
// answer keyed as "1/2" must get the marks, and a student who types "1.2.3"
// must not be told it equals anything.
//
// Numbers are compared as exact fractions of big integers, never as floats.
// 0.1 + 0.2 is not 0.3 in binary floating point, and a scoring rule that
// depends on how a decimal happens to round is a scoring dispute. Floats are
// used only where an admin has asked for a tolerance, which is a statement that
// approximate is fine.
//
// Pure and dependency-free, so the same code scores in Phase 4 that is tested
// here.

export const numericalAnswerMaxLength = 50;

export interface NumericalKey {
  accepted: string[];
  tolerance?: number;
}

interface Rational {
  denominator: bigint;
  numerator: bigint;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function reduce(numerator: bigint, denominator: bigint): Rational | null {
  if (denominator === 0n) return null;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator, denominator) || 1n;
  return { denominator: denominator / divisor, numerator: numerator / divisor };
}

// "12", "-3.50", ".5", "5.", "1,250.75". A comma is read only as a thousands
// separator in a correctly grouped number: "1,5" is refused rather than
// guessed, because a European decimal and an Indian typo read the same.
const decimalPattern = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

function parseDecimal(text: string): Rational | null {
  const match = decimalPattern.exec(text);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const wholeDigits = whole.replace(/,/g, "");
  if (wholeDigits === "" && fraction === "") return null;
  const digits = `${wholeDigits}${fraction}` || "0";
  const magnitude = BigInt(digits);
  return reduce(sign === "-" ? -magnitude : magnitude, 10n ** BigInt(fraction.length));
}

// Returns the exact value typed, or null where it is not a number this
// platform reads. Accepted: integers, decimals, and one fraction bar between
// two of them -- "1/2", "-3/4", "2.5/5". Refused: scientific notation, percent
// signs, units, and more than one fraction bar, because each has a reading a
// student could reasonably dispute.
export function parseNumericalAnswer(raw: string): Rational | null {
  if (typeof raw !== "string") return null;
  const text = raw
    // A minus sign pasted from a document is often U+2212, not a hyphen.
    .replace(/[−–]/g, "-")
    .replace(/\s+/g, "");
  if (text === "" || text.length > numericalAnswerMaxLength) return null;

  const parts = text.split("/");
  if (parts.length === 1) return parseDecimal(parts[0]);
  if (parts.length !== 2) return null;

  const top = parseDecimal(parts[0]);
  const bottom = parseDecimal(parts[1]);
  if (!top || !bottom || bottom.numerator === 0n) return null;
  return reduce(top.numerator * bottom.denominator, top.denominator * bottom.numerator);
}

function toNumber(value: Rational): number {
  return Number(value.numerator) / Number(value.denominator);
}

// Whether a student's typed answer matches the key. Anything unreadable is
// wrong rather than an error, since the student typed it and scoring must
// always finish.
export function isNumericalAnswerCorrect(given: string, key: NumericalKey): boolean {
  const answer = parseNumericalAnswer(given);
  if (!answer) return false;

  const tolerance = typeof key.tolerance === "number" && key.tolerance > 0 ? key.tolerance : 0;

  return key.accepted.some((form) => {
    const expected = parseNumericalAnswer(form);
    if (!expected) return false;
    if (tolerance === 0) {
      return answer.numerator === expected.numerator && answer.denominator === expected.denominator;
    }
    // A hair of slack so that a tolerance of 0.01 accepts a difference that
    // is 0.01 in decimal but 0.010000000000000009 in binary.
    return Math.abs(toNumber(answer) - toNumber(expected)) <= tolerance + 1e-9;
  });
}
