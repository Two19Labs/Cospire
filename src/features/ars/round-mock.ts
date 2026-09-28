// The ARS aptitude round, linked to a mock test.
//
// No migration: `ars_rounds.config` is JSONB, and an off-platform round carries
// `mockId` beside whatever it already held. An imported aptitude round arrives
// with `pendingFeature: "test-engine"` and its specification under `test`;
// linking a mock clears the placeholder, and unlinking puts it back only when
// that specification is there to describe.
//
// Pure functions, so the reading and the validation are unit tested without a
// database. The admin's session still decides whether the mock and the round
// can be read and written; nothing here grants anything.

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// The linked mock's id, or null. Anything that is not a positive safe integer
// -- a string, a float, a hand-edited negative -- reads as "no mock" rather
// than as a link to something that cannot exist.
export function readRoundMockId(config: unknown): number | null {
  const raw = asRecord(config).mockId;
  return isPositiveId(raw) ? raw : null;
}

// The select posts "" for "no mock" and a decimal id otherwise. Anything else
// is refused, because a Server Action is a public endpoint.
export type MockIdField = { mockId: number | null; ok: true } | { ok: false };

export function parseMockIdField(raw: unknown): MockIdField {
  if (raw === "") return { mockId: null, ok: true };
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,15}$/.test(raw)) return { ok: false };
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? { mockId: parsed, ok: true } : { ok: false };
}

// The config to store. Every other key is kept -- the prompt, the imported
// test specification -- so linking never discards what the importer wrote.
export function withRoundMock(config: unknown, mockId: number | null): Record<string, unknown> {
  const next: Record<string, unknown> = { ...asRecord(config) };
  if (mockId === null) {
    delete next.mockId;
    if (next.test !== undefined) next.pendingFeature = "test-engine";
  } else {
    next.mockId = mockId;
    delete next.pendingFeature;
  }
  return next;
}
