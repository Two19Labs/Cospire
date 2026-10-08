export const mockPageSize = 50;
export const maxMockSections = 10;

export function parsePositiveInteger(value: FormDataEntryValue | null, maximum: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

// Form slot -> position in the saved section list. They are the same only when
// every slot above is filled: leave "Section 1" blank and fill "Section 2", and
// slot 1 becomes the mock's first section. Mapping by position instead filed
// questions into the wrong section, or refused the save outright.
export function mapSectionSlots(filledSlots: number[]): Map<number, number> {
  return new Map(filledSlots.map((slot, position) => [slot, position]));
}

// The section slot a question's dropdown posts: 0-based, and only a slot the
// form actually renders. Absent, blank or malformed returns null, which the
// caller turns into a refusal rather than a default.
export function parseSectionSlot(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed < maxMockSections ? parsed : null;
}

// Marks per correct answer: blank is null (keep each question's own marks), a
// number in (0, 100] with at most two decimals is that number, anything else is
// undefined so the caller can refuse it rather than guess.
export function parseMarks(value: FormDataEntryValue | null): number | null | undefined {
  if (value === null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string" || !/^\d{1,3}(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return parsed > 0 && parsed <= 100 ? parsed : undefined;
}

export function normaliseMockText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function parseMockPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}
