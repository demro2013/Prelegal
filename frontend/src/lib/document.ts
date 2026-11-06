/**
 * A small document model shared by the on-screen preview and the PDF.
 *
 * Templates are parsed into this model before any user input is added, so
 * values from the conversation are never interpreted as markdown.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string }
  /** A defined term whose value is on the Cover Page or a similar page. */
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
  /** `label` is the printed number, such as "5.", "5.2" or "(a)". */
  | { type: "numbered"; label: string; depth: number; content: Inline[] }
  | { type: "checkbox"; checked: boolean; content: Inline[] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

/** A template's two sheets. Documents without a cover file get a generated one. */
export type AgreementTemplates = {
  coverPage?: Block[];
  standardTerms: Block[];
};

export type Agreement = {
  coverPage: Block[];
  standardTerms: Block[];
};

const INLINE_PATTERN =
  /<span\b([^>]*)>(.*?)<\/span>|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|<(https?:[^>\s]+)>|<label>(.+?)<\/label>|\[([^\]]+)\]/g;

const SPAN_TAG = /<\/?span\b[^>]*>/g;

function parseSpan(attributes: string, inner: string): Inline[] {
  const className = attributes.match(/class="(\w+)"/)?.[1] ?? "";
  if (className.endsWith("_link")) return [{ type: "term", text: inner }];
  if (className.startsWith("header_")) return [{ type: "bold", text: inner }];
  // Other spans are only anchors around content such as a bold definition.
  return parseInline(inner);
}

export function parseInline(source: string): Inline[] {
  const content: Inline[] = [];
  let position = 0;

  for (const match of source.matchAll(INLINE_PATTERN)) {
    if (match.index > position) {
      content.push({ type: "text", text: source.slice(position, match.index) });
    }
    const [whole, attributes, inner, bold, linkText, href, url, hint, placeholder] =
      match;
    if (attributes !== undefined) content.push(...parseSpan(attributes, inner));
    else if (bold) {
      content.push({ type: "bold", text: bold.replace(SPAN_TAG, "") });
    } else if (linkText) content.push({ type: "link", text: linkText, href });
    else if (url) content.push({ type: "link", text: url, href: url });
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
  // The DPA contains an invisible left-to-right mark, which the PDF can't print.
  const lines = markdown.replaceAll("‎", "").split(/\r?\n/);
  // Section labels combine with their parent, so "2." under "5." prints as 5.2.
  let section = "";

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

    const depth = Math.floor(lines[index].search(/\S/) / 4);

    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      if (depth === 0) section = numbered[1];
      blocks.push({
        type: "numbered",
        label: depth === 0 ? `${section}.` : `${section}.${numbered[1]}`,
        depth,
        content: parseInline(numbered[2]),
      });
      continue;
    }

    const lettered = depth > 0 && line.match(/^([a-z]+)\.\s+(.*)$/);
    if (lettered) {
      blocks.push({
        type: "numbered",
        label: `(${lettered[1]})`,
        depth,
        content: parseInline(lettered[2]),
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
