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
  // Any pending import (D8) is settled by an explicit choice either way.
  delete next.importBatchId;
  if (mockId === null) {
    delete next.mockId;
    if (next.test !== undefined) next.pendingFeature = "test-engine";
  } else {
    next.mockId = mockId;
    delete next.pendingFeature;
  }
  return next;
}

// D8: one importer, opened from several places. An import of a paper started
// from an aptitude round marks the round with the import's batch id, so the
// mock built at the end of the review links itself to this round. The mark
// lives in the round's config rather than in the URL because the review is many
// form posts long and a query parameter would have to survive every one.
export function withImportBatch(config: unknown, batchId: string): Record<string, unknown> {
  return { ...asRecord(config), importBatchId: batchId };
}

const batchIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readImportBatchId(config: unknown): string | null {
  const raw = asRecord(config).importBatchId;
  return typeof raw === "string" && batchIdPattern.test(raw) ? raw : null;
}
