import { describe, expect, it } from "vitest";
import { parseImportedTemplate } from "./template-import-spec";

const valid = { name: "Final", readinessTags: ["Ready"], overallLevels: ["Strong"], components: [
  { title: "Application", weightagePct: 60, metrics: ["Clarity"], round: "Written Application" },
  { title: "Interview", weightagePct: 40, metricNames: [] },
] };

describe("parseImportedTemplate", () => {
  it("reads fenced model output and normalises aliases", () => {
    const result = parseImportedTemplate(`Here it is:\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
    expect(result.problems).toEqual([]);
    expect(result.template?.components[0]).toMatchObject({ metricNames: ["Clarity"], roundName: "Written Application", weightagePct: 60 });
  });
  it("refuses totals other than 100", () => {
    const result = parseImportedTemplate(JSON.stringify({ ...valid, components: [{ title: "Only", weightagePct: 90 }] }));
    expect(result.problems).toContain("Component weightages total 90%; they must total exactly 100%.");
  });
  it("reports a cut-off model answer", () => {
    expect(parseImportedTemplate('{"name":"Final"').problems[0]).toContain("cut off");
  });
  it("refuses invalid vocabularies and component values", () => {
    const result = parseImportedTemplate(JSON.stringify({ ...valid, readinessTags: [], components: [{ title: "", weightagePct: 100 }] }));
    expect(result.problems.length).toBeGreaterThanOrEqual(2);
  });
});
