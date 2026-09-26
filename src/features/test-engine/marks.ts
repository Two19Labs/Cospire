// Marks as a student reads them: whole numbers bare, fractions to at most two
// places (2.5, 2.25, -0.33), matching the numeric(…, 2) columns that hold them.
// The one formatter for marks and scores; the result screen, the mock screens
// and analytics all use it.
export function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}
