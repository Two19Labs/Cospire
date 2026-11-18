import type { CurriculumMessage } from "@/features/curriculum/curriculum";

// Pure rules for attaching modules to a programme's subjects. Kept out of
// `queries/` and `actions/` (both `server-only`) so a unit test can reach them.

export const mocksSectionTitle = "Full mocks";

interface DbError {
  code?: string | null;
  message?: string | null;
}

// The primary key (section_id, module_id) refuses a second attachment (23505);
// the `section_modules_validate` trigger refuses the mocks section. Anything
// else is a plain failure: the admin gets a sentence, never a database error.
export function attachFailure(error: DbError): CurriculumMessage {
  if (error.code === "23505") return "module-already-attached";
  if ((error.message ?? "").includes("mocks section")) return "mocks-no-modules";
  return "module-attach-failed";
}

// A second `mocks` section hits the partial unique index.
export function mocksSectionFailure(error: DbError): CurriculumMessage {
  return error.code === "23505" ? "mocks-exists" : "mocks-failed";
}

// The mocks section holds only test items (`validate_curriculum_item_parent`).
export function isMocksSection(section: { kind: string }): boolean {
  return section.kind === "mocks";
}

export function canHoldItem(section: { kind: string }, itemType: string): boolean {
  return !isMocksSection(section) || itemType === "test";
}

export function hasMocksSection(sections: { kind: string }[]): boolean {
  return sections.some(isMocksSection);
}

export interface AttachedModule {
  itemCount: number;
  moduleId: number;
  sortOrder: number;
  title: string;
}

// Raw `section_modules` rows with the module's title and its item count
// embedded, grouped by subject in attachment order (ties break on module id).
export interface AttachmentRow {
  module_id: number;
  modules: { curriculum_items: { count: number }[] | null; title: string } | null;
  section_id: number;
  sort_order: number;
}

export function groupAttachments(rows: AttachmentRow[]): Map<number, AttachedModule[]> {
  const result = new Map<number, AttachedModule[]>();
  for (const row of rows) {
    if (!row.modules) continue;
    const list = result.get(row.section_id) ?? [];
    list.push({
      itemCount: row.modules.curriculum_items?.[0]?.count ?? 0,
      moduleId: row.module_id,
      sortOrder: row.sort_order,
      title: row.modules.title,
    });
    result.set(row.section_id, list);
  }
  for (const list of result.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.moduleId - b.moduleId);
  return result;
}

// Module ids are the `id` that `planMove` and `nextSortOrder` work on.
export function toOrdered(modules: { moduleId: number; sortOrder: number }[]) {
  return modules.map((row) => ({ id: row.moduleId, sortOrder: row.sortOrder }));
}
