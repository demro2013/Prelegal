/**
 * A small document model shared by the on-screen preview and the PDF.
 *
 * Templates are parsed into this model before any user input is added, so
 * values typed into the form are never interpreted as markdown.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string }
  /** A defined term that refers to a value on the Cover Page. */
  | { type: "term"; text: string }
  /** Guidance printed in the template, such as what a section is for. */
  | { type: "hint"; text: string }
  /** A bracketed blank in the template that has not been processed yet. */
  | { type: "placeholder"; text: string }
  /** A blank after processing. `filled` is false while it awaits a value. */
  | { type: "field"; text: string; filled: boolean };

export type Block =
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "numbered"; number: number; content: Inline[] }
  | { type: "checkbox"; checked: boolean; content: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const INLINE_PATTERN =
  /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|<span class="coverpage_link">(.+?)<\/span>|<label>(.+?)<\/label>|\[([^\]]+)\]/g;

export function parseInline(source: string): Inline[] {
  const content: Inline[] = [];
  let position = 0;

  for (const match of source.matchAll(INLINE_PATTERN)) {
    if (match.index > position) {
      content.push({ type: "text", text: source.slice(position, match.index) });
    }
    const [whole, bold, linkText, href, term, hint, placeholder] = match;
    if (bold) content.push({ type: "bold", text: bold });
    else if (linkText) content.push({ type: "link", text: linkText, href });
    else if (term) content.push({ type: "term", text: term });
    else if (hint) content.push({ type: "hint", text: hint });
    else content.push({ type: "placeholder", text: placeholder });
    position = match.index + whole.length;
  }

  if (position < source.length) {
    content.push({ type: "text", text: source.slice(position) });
  }
  return content;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseTable(lines: string[]): Block {
  const [headerLine, , ...rowLines] = lines;
  const header = parseTableRow(headerLine);
  return {
    type: "table",
    header: header.map(parseInline),
    rows: rowLines.map((line) => {
      const cells = parseTableRow(line);
      // The template omits trailing empty cells on some rows.
      return header.map((_, index) => parseInline(cells[index] ?? ""));
    }),
  };
}

/** Parses the subset of markdown used by the Common Paper templates. */
export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;

    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (lines[index]?.trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index++;
      }
      index--;
      blocks.push(parseTable(tableLines));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: parseInline(heading[2]),
      });
      continue;
    }

    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      blocks.push({
        type: "numbered",
        number: Number(numbered[1]),
        content: parseInline(numbered[2]),
      });
      continue;
    }

    const checkbox = line.match(/^- \[( |x)\]\s+(.*)$/);
    if (checkbox) {
      blocks.push({
        type: "checkbox",
        checked: checkbox[1] === "x",
        content: parseInline(checkbox[2]),
      });
      continue;
    }

    blocks.push({ type: "paragraph", content: parseInline(line) });
  }
  return blocks;
}

export function inlineText(content: Inline[]): string {
  return content.map((inline) => inline.text).join("");
}

export function isSignatureRow(row: Inline[][]): boolean {
  return inlineText(row[0]).trim() === "Signature";
}
