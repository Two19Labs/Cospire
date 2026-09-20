import { extractJsonBlock } from "@/features/ars/import-spec";

import {
  componentTitleMaxLength,
  maxComponents,
  maxMetricNames,
  maxVocabularyItems,
  metricLabelMaxLength,
  metricNameMaxLength,
  templateNameMaxLength,
  vocabularyItemMaxLength,
} from "./template-input";

export interface ImportedTemplateComponent {
  metricHasNotes: boolean;
  metricHasScores: boolean;
  metricLabel: string;
  metricNames: string[];
  roundName: string | null;
  title: string;
  usesActionPlan: boolean;
  usesDevelopmentAreas: boolean;
  usesStrengths: boolean;
  weightagePct: number;
}

export interface ImportedTemplate {
  components: ImportedTemplateComponent[];
  name: string;
  overallLevels: string[];
  readinessTags: string[];
}

export interface TemplateImportOutcome {
  problems: string[];
  template: ImportedTemplate | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(source: Record<string, unknown>, key: string): string {
  return typeof source[key] === "string" ? source[key].trim() : "";
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (values.some((item) => !item || item.length > maxLength)) return null;
  return [...new Set(values)];
}

function bool(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  return typeof source[key] === "boolean" ? source[key] : fallback;
}

export function parseImportedTemplate(raw: string): TemplateImportOutcome {
  const block = extractJsonBlock(raw);
  if (!block) return { problems: ["No JSON object was found in the pasted answer."], template: null };
  let parsed: unknown;
  try { parsed = JSON.parse(block); } catch {
    return { problems: [block.trim().endsWith("}") ? "The JSON is not valid." : "The JSON looks cut off before its closing brace."], template: null };
  }
  const root = record(parsed);
  if (!root) return { problems: ["The model's answer must be one JSON object."], template: null };

  const problems: string[] = [];
  const name = text(root, "name") || text(root, "templateName");
  if (!name || name.length > templateNameMaxLength) problems.push(`Template name is required and must be at most ${templateNameMaxLength} characters.`);
  const readinessTags = stringList(root.readinessTags ?? root.readiness_tags, maxVocabularyItems, vocabularyItemMaxLength);
  const overallLevels = stringList(root.overallLevels ?? root.overall_levels, maxVocabularyItems, vocabularyItemMaxLength);
  if (!readinessTags?.length) problems.push("Give at least one readiness tag.");
  if (!overallLevels?.length) problems.push("Give at least one overall level.");

  const rawComponents = Array.isArray(root.components) ? root.components : [];
  if (!rawComponents.length || rawComponents.length > maxComponents) problems.push(`Give between 1 and ${maxComponents} components.`);
  const components: ImportedTemplateComponent[] = [];
  rawComponents.slice(0, maxComponents).forEach((entry, index) => {
    const item = record(entry);
    const prefix = `Component ${index + 1}`;
    if (!item) { problems.push(`${prefix} must be an object.`); return; }
    const title = text(item, "title") || text(item, "name");
    const weight = Number(item.weightagePct ?? item.weightage ?? item.weight);
    const metricLabel = text(item, "metricLabel") || "Metric";
    const metricNames = stringList(item.metricNames ?? item.metrics ?? [], maxMetricNames, metricNameMaxLength);
    if (!title || title.length > componentTitleMaxLength) problems.push(`${prefix} needs a title of at most ${componentTitleMaxLength} characters.`);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100 || Math.round(weight * 100) !== weight * 100) problems.push(`${prefix} needs a weightage from 0.01 to 100 with at most two decimals.`);
    if (metricLabel.length > metricLabelMaxLength) problems.push(`${prefix}'s metric label is too long.`);
    if (metricNames === null) problems.push(`${prefix}'s metrics are invalid or too numerous.`);
    components.push({
      metricHasNotes: bool(item, "metricHasNotes", true), metricHasScores: bool(item, "metricHasScores", true),
      metricLabel, metricNames: metricNames ?? [], roundName: text(item, "roundName") || text(item, "round") || null,
      title, usesActionPlan: bool(item, "usesActionPlan", true), usesDevelopmentAreas: bool(item, "usesDevelopmentAreas", true),
      usesStrengths: bool(item, "usesStrengths", true), weightagePct: weight,
    });
  });
  const total = Math.round(components.reduce((sum, item) => sum + item.weightagePct, 0) * 100) / 100;
  if (components.length && total !== 100) problems.push(`Component weightages total ${total}%; they must total exactly 100%.`);
  return problems.length ? { problems, template: null } : { problems: [], template: { components, name, overallLevels: overallLevels!, readinessTags: readinessTags! } };
}
