// Pure rules for the curriculum builder and the student's programme page.
//
// Kept out of `queries/` and `actions/` because those are `server-only`, which
// makes them unreachable from a unit test.

// 'video' is in the database check constraint already; it becomes creatable
// when the video library lands. Until then the builder offers these three.
export const buildableItemTypes = ["document", "test", "text"] as const;
export type BuildableItemType = (typeof buildableItemTypes)[number];
export type CurriculumItemType = BuildableItemType | "video";

export const itemTypeLabels: Record<CurriculumItemType, string> = {
  document: "Document",
  test: "Test",
  text: "Reading",
  video: "Video",
};

export function parseItemType(raw: unknown): BuildableItemType | null {
  return typeof raw === "string" && (buildableItemTypes as readonly string[]).includes(raw)
    ? (raw as BuildableItemType)
    : null;
}

export function parsePositiveId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^[0-9]{1,18}$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseDirection(raw: unknown): "up" | "down" | null {
  return raw === "up" || raw === "down" ? raw : null;
}

// Mirrors the database checks, so an admin gets a sentence rather than a 23514.
export function normaliseTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const title = raw.replace(/\s+/g, " ").trim();
  return title.length > 0 && title.length <= 200 ? title : null;
}

export function normaliseBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.replace(/\r\n/g, "\n").trim();
  return body.length > 0 && body.length <= 20000 ? body : null;
}

export interface Ordered {
  id: number;
  sortOrder: number;
}

// Moves one entry a place up or down and returns the rows whose sort_order must
// change, renumbered 0..n-1 in the new order.
//
// Renumbering rather than swapping two values is what makes this safe without
// a transaction: if a write fails half way, ties break on id, the list is still
// a valid order, and the next move renumbers it cleanly. Swapping two equal
// values, by contrast, would do nothing for ever.
export function planMove(
  rows: Ordered[],
  id: number,
  direction: "up" | "down",
): Ordered[] {
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const index = ordered.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return [];

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  return ordered
    .map((row, position) => ({ id: row.id, sortOrder: position }))
    .filter((row) => rows.find((original) => original.id === row.id)?.sortOrder !== row.sortOrder);
}

export function nextSortOrder(rows: Ordered[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
}

export interface ProgressInput {
  // Stored rows from item_progress, keyed by item id.
  stored: Map<number, boolean>;
  // Mock ids the student has a submitted attempt on.
  submittedMocks: Set<number>;
}

// A test item's completion is derived from attempts; everything else is read
// from item_progress. See the migration 20261008120000 for why.
export function isItemComplete(
  item: { id: number; refId: number | null; type: CurriculumItemType },
  progress: ProgressInput,
): boolean {
  if (item.type === "test") return item.refId !== null && progress.submittedMocks.has(item.refId);
  return progress.stored.get(item.id) === true;
}

export function completionPercent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

// Where an item opens for a student, when it opens by a plain link. A document
// opens through a form instead (null here), because opening it records progress
// and a GET must not write: Next prefetches links.
export function studentItemHref(
  courseId: number,
  item: { id: number; refId: number | null; type: CurriculumItemType },
): string | null {
  if (item.type === "test") return item.refId === null ? null : `/student/mocks/${item.refId}`;
  if (item.type === "text") return `/student/programmes/${courseId}/items/${item.id}`;
  return null;
}

// The builder's outcomes, carried back on `?curriculum=` as a closed set so a
// URL can never put arbitrary text on the page.
export const curriculumMessages = {
  "item-added": { error: false, text: "Item added." },
  "item-failed": { error: true, text: "That item could not be added. Check the choice and try again." },
  "item-removed": { error: false, text: "Item removed." },
  "moved": { error: false, text: "Order updated." },
  "not-programme": { error: true, text: "Only a programme has a curriculum." },
  "section-added": { error: false, text: "Section added." },
  "section-failed": { error: true, text: "That section could not be saved. A title of up to 200 characters is required." },
  "section-removed": { error: false, text: "Section and its items removed." },
  "change-failed": { error: true, text: "That change was not saved. Reload and try again." },
} as const;

export type CurriculumMessage = keyof typeof curriculumMessages;

export function parseCurriculumMessage(raw: unknown): CurriculumMessage | null {
  return typeof raw === "string" && Object.hasOwn(curriculumMessages, raw)
    ? (raw as CurriculumMessage)
    : null;
}
