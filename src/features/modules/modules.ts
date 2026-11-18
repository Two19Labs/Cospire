import { normaliseTitle } from "@/features/curriculum/curriculum";

// Pure rules for the admin module library. Kept out of `queries/` and
// `actions/` (both `server-only`) so a unit test can reach them.

export { normaliseTitle, parsePositiveId } from "@/features/curriculum/curriculum";
export { parsePageNumber, sanitizeCourseSearch as sanitizeModuleSearch } from "@/features/curriculum/list-params";

export const modulesPageSize = 25;
export const moduleTitleMaxLength = 200;

const copySuffix = " (copy)";

// The title of a duplicate: the original plus " (copy)", cut back so the
// whole still fits the database's 200-character limit.
export function copyTitle(title: string): string {
  const base = normaliseTitle(title) ?? title.trim();
  const room = moduleTitleMaxLength - copySuffix.length;
  return `${base.length > room ? base.slice(0, room).trimEnd() : base}${copySuffix}`;
}

export interface AttachmentRow {
  moduleId: number;
  courseId: number;
  courseTitle: string;
}

// The distinct programmes each module is attached to. A module attached to two
// subjects of one programme still counts that programme once.
export function programmesByModule(rows: AttachmentRow[]): Map<number, { id: number; title: string }[]> {
  const result = new Map<number, { id: number; title: string }[]>();
  for (const row of rows) {
    const list = result.get(row.moduleId) ?? [];
    if (!list.some((programme) => programme.id === row.courseId)) {
      list.push({ id: row.courseId, title: row.courseTitle });
    }
    result.set(row.moduleId, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.title.localeCompare(b.title) || a.id - b.id);
  return result;
}

// Outcomes carried back on `?m=` as a closed set, so a URL can never put
// arbitrary text on the page.
export const moduleMessages = {
  created: { error: false, text: "Module created. Add its items below." },
  renamed: { error: false, text: "Module renamed." },
  "title-invalid": { error: true, text: "Give the module a title of up to 200 characters." },
  "create-failed": { error: true, text: "That module could not be created. Nothing changed." },
  "rename-failed": { error: true, text: "That module could not be renamed. Nothing changed." },
  duplicated: { error: false, text: "Duplicated. This is the copy; it is not attached to any programme." },
  "duplicate-failed": { error: true, text: "That module could not be duplicated. Nothing was copied." },
  "item-added": { error: false, text: "Item added." },
  "item-failed": { error: true, text: "That item could not be added. Check the choice and try again." },
  "item-removed": { error: false, text: "Item removed." },
  moved: { error: false, text: "Order updated." },
  "change-failed": { error: true, text: "That change was not saved. Reload and try again." },
  "invalid-request": { error: true, text: "That request was not valid. Nothing changed." },
} as const;

export type ModuleMessage = keyof typeof moduleMessages;

export function parseModuleMessage(raw: unknown): ModuleMessage | null {
  return typeof raw === "string" && Object.hasOwn(moduleMessages, raw) ? (raw as ModuleMessage) : null;
}

export function buildModulesHref({ message, page, search }: { message?: ModuleMessage; page: number; search: string }): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  if (message) params.set("m", message);
  const query = params.toString();
  return query ? `/admin/modules?${query}` : "/admin/modules";
}

export function buildModuleHref(moduleId: number, message?: ModuleMessage): string {
  return message ? `/admin/modules/${moduleId}?m=${message}` : `/admin/modules/${moduleId}`;
}
