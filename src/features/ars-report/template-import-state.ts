import type { ImportedTemplate } from "./template-import-spec";

export interface TemplateImportState { pasted: string; problems: string[]; template: ImportedTemplate | null }
export const initialTemplateImportState: TemplateImportState = { pasted: "", problems: [], template: null };
