// Reading the body of a Word document: its text, its tables, and where each
// picture sat.
//
// Pure, and deliberately kept apart from the zip in `docx.ts`, so the awkward
// half -- what Word's XML actually looks like -- is testable against fragments
// rather than against a binary fixture.
//
// **This is not a general XML parser and must not become one.** It walks
// `word/document.xml`, which Word writes and nobody types, so it can assume
// well-formed markup. What it cannot assume is a tidy document: a question paper
// arrives with tracked changes, field codes, floating pictures and tables inside
// tables, and each of those has cost someone an afternoon in some other project.
// Every element named below is named because ignoring it produces wrong text,
// not because it might one day.
//
// The output is what an admin pastes into a model, so it is plain text: no
// Markdown, no HTML, and one marker shape, `[[figure:N]]`, numbered in document
// order. `docx.ts` decides which of those numbers has an image behind it.

// A picture, drawing, chart or embedded object, in the order it appears.
export interface DocxFigureRef {
  // 1-based, document order, and the N in the marker.
  n: number;
  // The relationship id naming the part, resolved against document.xml.rels.
  // Null for an embedded object with no picture of its own.
  relId: string | null;
  // What held it. `chart` and `object` never have an image to export; `pict` is
  // usually EMF or WMF. See `classifyFigure` in docx.ts.
  source: "chart" | "drawing" | "object" | "pict";
}

export interface DocxBody {
  figures: DocxFigureRef[];
  text: string;
  // Word keeps a numbered list's numbers in numbering.xml, not in the text, so
  // they are not in `text` either. Worth saying rather than leaving the admin to
  // notice that every question is called "Q." -- see the note in `readDocx`.
  usesAutoNumbering: boolean;
}

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

interface Tag {
  attrs: string;
  kind: "close" | "open" | "self";
  name: string;
}

type Token = { tag: Tag; type: "tag" } | { text: string; type: "text" };

const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function decode(raw: string): string {
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return entities[body] ?? whole;
  });
}

// Reads an attribute off a tag's raw attribute text. Quotes are respected, so a
// value containing `>` or another attribute's name cannot be misread.
function attr(attrs: string, name: string): string | null {
  const pattern = new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const match = attrs.match(pattern);
  if (!match) return null;
  return decode(match[2] ?? match[3] ?? "");
}

function* tokenise(xml: string): Generator<Token> {
  let at = 0;

  while (at < xml.length) {
    const open = xml.indexOf("<", at);
    if (open === -1) {
      if (at < xml.length) yield { text: xml.slice(at), type: "text" };
      return;
    }
    if (open > at) yield { text: xml.slice(at, open), type: "text" };

    // Comments, processing instructions and CDATA carry nothing this reads.
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open);
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open);
      yield { text: xml.slice(open + 9, end === -1 ? xml.length : end), type: "text" };
      at = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<?", open) || xml.startsWith("<!", open)) {
      const end = xml.indexOf(">", open);
      at = end === -1 ? xml.length : end + 1;
      continue;
    }

    // Walk to the closing `>`, stepping over quoted attribute values.
    let cursor = open + 1;
    let quote: string | null = null;
    while (cursor < xml.length) {
      const char = xml[cursor];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      cursor += 1;
    }
    if (cursor >= xml.length) return;

    const inner = xml.slice(open + 1, cursor);
    at = cursor + 1;

    const closing = inner.startsWith("/");
    const selfClosing = inner.endsWith("/");
    const bare = inner.slice(closing ? 1 : 0, selfClosing ? -1 : undefined);
    const split = bare.search(/[\s]/);
    const name = (split === -1 ? bare : bare.slice(0, split)).trim();
    if (name === "") continue;

    yield {
      tag: { attrs: split === -1 ? "" : bare.slice(split), kind: closing ? "close" : selfClosing ? "self" : "open", name },
      type: "tag",
    };
  }
}

// ---------------------------------------------------------------------------
// Walking the body
// ---------------------------------------------------------------------------

// Subtrees that must never contribute text.
//
// `mc:Fallback` is the one that silently doubles every picture: Word writes a
// modern drawing under `mc:Choice` and a VML copy of the same picture under
// `mc:Fallback`, and a reader that takes both reports two figures where the page
// shows one. `w:del` is text someone deleted with track changes on, and
// `w:instrText` is a field's code -- "PAGE", "REF _Ref123" -- never its result.
const skippedSubtrees = new Set(["mc:Fallback", "w:instrText", "w:del", "w:delInstrText"]);

function renderTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    const cells = [...row];
    while (cells.length < width) cells.push("");
    return `| ${cells.map((cell) => cell.replace(/\s+/g, " ").trim()).join(" | ")} |`;
  });
}

export function readDocxBody(documentXml: string): DocxBody {
  // Both stacks, so a table inside a table cell nests rather than flattening.
  // The row belongs to its table and not to the walk: a single `row` variable
  // works until an inner table's `</w:tr>` clears the outer table's row, and
  // then the whole outer table comes out empty.
  const sinks: string[][] = [[]];
  const tables: { row: string[] | null; rows: string[][] }[] = [];
  let paragraph: string[] = [];
  let inParagraph = false;

  const figures: DocxFigureRef[] = [];
  let usesAutoNumbering = false;

  // Set when a `<w:drawing>` or `<w:object>` opens, so the `a:blip` or
  // `v:imagedata` inside it is attributed to the right container, and so a
  // container holding neither is still counted as a figure that was there.
  let container: { claimed: boolean; kind: DocxFigureRef["source"] } | null = null;

  let depth = 0;
  let skipBelow: number | null = null;
  // Text is taken from `<w:t>` alone, never from whatever sits between tags. A
  // .docx Word wrote has no whitespace between elements, but one that has been
  // through a formatter or another tool does, and collecting it would indent
  // every line of the paper with the XML's own indentation.
  let inText = false;

  const sink = () => sinks[sinks.length - 1];

  const addFigure = (relId: string | null, source: DocxFigureRef["source"]) => {
    figures.push({ n: figures.length + 1, relId, source });
    const marker = `[[figure:${figures.length}]]`;
    if (inParagraph) paragraph.push(marker);
    else sink().push(marker);
  };

  for (const token of tokenise(documentXml)) {
    if (token.type === "text") {
      if (inText && skipBelow === null && inParagraph) paragraph.push(decode(token.text));
      continue;
    }

    const { attrs, kind, name } = token.tag;

    if (kind === "close") {
      depth -= 1;
      if (skipBelow !== null && depth < skipBelow) skipBelow = null;
      if (skipBelow !== null) continue;
    } else if (kind === "open") {
      depth += 1;
      if (skipBelow !== null) continue;
      if (skippedSubtrees.has(name)) {
        skipBelow = depth;
        continue;
      }
    } else if (skipBelow !== null) {
      continue;
    } else if (skippedSubtrees.has(name)) {
      continue;
    }

    switch (name) {
      case "w:t":
        // `w:delText` is never reached: `w:del` is skipped whole.
        if (kind === "open") inText = true;
        else if (kind === "close") inText = false;
        break;

      case "w:p":
        if (kind === "open") {
          paragraph = [];
          inParagraph = true;
          inText = false;
        } else if (kind === "close") {
          sink().push(paragraph.join(""));
          paragraph = [];
          inParagraph = false;
        }
        break;

      case "w:tbl":
        if (kind === "open") tables.push({ row: null, rows: [] });
        else if (kind === "close") {
          const table = tables.pop();
          if (table) for (const line of renderTable(table.rows)) sink().push(line);
        }
        break;

      case "w:tr": {
        const table = tables[tables.length - 1];
        if (!table) break;
        if (kind === "open") table.row = [];
        else if (kind === "close") {
          if (table.row) table.rows.push(table.row);
          table.row = null;
        }
        break;
      }

      case "w:tc":
        if (kind === "open") sinks.push([]);
        else if (kind === "close") {
          const lines = sinks.pop() ?? [];
          tables[tables.length - 1]?.row?.push(lines.join(" "));
        }
        break;

      case "w:br":
        if (inParagraph) paragraph.push("\n");
        break;

      case "w:tab":
        if (inParagraph) paragraph.push("\t");
        break;

      case "w:numPr":
        usesAutoNumbering = true;
        break;

      case "w:drawing":
      case "w:object":
      case "w:pict":
        if (kind === "open") {
          container = { claimed: false, kind: name === "w:drawing" ? "drawing" : name === "w:object" ? "object" : "pict" };
        } else if (kind === "close") {
          // A container that named no part is still something the page showed.
          if (container && !container.claimed) addFigure(null, container.kind);
          container = null;
        }
        break;

      // The modern picture: `<a:blip r:embed="rId7"/>` inside a drawing.
      case "a:blip": {
        const relId = attr(attrs, "r:embed") ?? attr(attrs, "r:link");
        if (relId && container) {
          container.claimed = true;
          addFigure(relId, container.kind);
        }
        break;
      }

      // A native Word chart: live data, not a picture, so there is nothing to
      // export. `c:chart` is self-closing and sits inside the drawing.
      case "c:chart": {
        const relId = attr(attrs, "r:id");
        if (container) {
          container.claimed = true;
          addFigure(relId, "chart");
        }
        break;
      }

      // The legacy VML picture, which is how Word stores EMF and WMF drawings.
      case "v:imagedata": {
        const relId = attr(attrs, "r:id") ?? attr(attrs, "o:relid");
        if (relId && container) {
          container.claimed = true;
          addFigure(relId, container.kind === "object" ? "object" : "pict");
        }
        break;
      }

      default:
        break;
    }
  }

  const text = sinks[0]
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { figures, text, usesAutoNumbering };
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

// `word/_rels/document.xml.rels`: relationship id to the part it names. Targets
// are relative to `word/`, and an absolute or external target is left as it is
// for the caller to reject.
export function readRelationships(relsXml: string): Record<string, string> {
  const rels: Record<string, string> = {};
  for (const token of tokenise(relsXml)) {
    if (token.type !== "tag" || token.tag.name !== "Relationship") continue;
    const id = attr(token.tag.attrs, "Id");
    const target = attr(token.tag.attrs, "Target");
    const mode = attr(token.tag.attrs, "TargetMode");
    if (id && target && mode !== "External") rels[id] = target;
  }
  return rels;
}
