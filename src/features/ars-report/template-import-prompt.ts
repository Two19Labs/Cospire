import { maxComponents, maxMetricNames } from "./template-input";

export function buildTemplateImportPrompt(): string {
  return `You are reading an assessment/report document for an admissions-readiness platform.
Return ONLY one JSON object describing the reusable report template. No markdown or commentary.

Use this exact shape:
{
  "name": "Application Readiness — Final Assessment",
  "readinessTags": ["Ready", "Developing", "Needs Work"],
  "overallLevels": ["Strong", "Moderate", "Emerging"],
  "components": [
    {
      "title": "Video Essay",
      "weightagePct": 20,
      "roundName": "Video Essay",
      "metricLabel": "Metric",
      "metricNames": ["Originality", "Communication", "Delivery"],
      "metricHasScores": true,
      "metricHasNotes": true,
      "usesStrengths": true,
      "usesDevelopmentAreas": true,
      "usesActionPlan": true
    }
  ]
}

Rules:
1. Use at most ${maxComponents} components and at most ${maxMetricNames} metrics per component.
2. Component weightages must total exactly 100. Do not invent a missing weight; report the document's values.
3. "roundName" is optional. Include it only when the document clearly ties the component to an ARS round, using the round's exact name.
4. A component may have no metrics. Use an empty "metricNames" list.
5. Boolean flags say which inputs a mentor fills. Preserve the document's structure. If it visibly has Strengths, Development Areas, or Action Plan blocks, set those flags true.
6. Readiness tags and overall levels are the selectable rating vocabularies printed in the document. Do not merge the two lists.
7. Do not invent components, scoring criteria, labels, or ratings not present in the document.

The document follows.`;
}
