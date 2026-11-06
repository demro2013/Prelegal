import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdown, type Block } from "./document";
import { UNSUPPORTED_CHARACTER, type DocumentDefinition } from "./documents";
import { loadAgreementTemplates, loadDocuments, TEMPLATES_DIRECTORY } from "./loadTemplates";

function blockText(block: Block): string {
  return block.type === "table"
    ? [block.header, ...block.rows].flat().map(inlineText).join(" ")
    : inlineText(block.content);
}

let documents: DocumentDefinition[];

beforeAll(async () => {
  documents = await loadDocuments();
});

describe("parseInline", () => {
  it("treats every *_link class as a defined term", () => {
    for (const name of ["coverpage", "keyterms", "orderform", "sow", "businessterms"]) {
      expect(parseInline(`<span class="${name}_link">Fees</span>`)).toEqual([
        { type: "term", text: "Fees" },
      ]);
    }
  });

  it("treats header spans as bold, ignoring other attributes", () => {
    expect(parseInline('<span class="header_3" id="1.1">Uptime.</span> Text')).toEqual([
      { type: "bold", text: "Uptime." },
      { type: "text", text: " Text" },
    ]);
  });

  it("keeps a term that also has an id", () => {
    expect(parseInline('<span class="orderform_link" id="3.2.a">Credit</span>')).toEqual([
      { type: "term", text: "Credit" },
    ]);
  });

  it("unwraps anchor spans around a bold definition, and drops empty ones", () => {
    expect(parseInline('<span id="4.1">**"Minutes"**</span> means')).toEqual([
      { type: "bold", text: '"Minutes"' },
      { type: "text", text: " means" },
    ]);
    expect(parseInline('<span id="4.7"></span>**"Train"**')).toEqual([
      { type: "bold", text: '"Train"' },
    ]);
  });

  it("removes span tags inside bold text", () => {
    expect(
      parseInline('**not more than the <span class="keyterms_link">Cap</span>.**'),
    ).toEqual([{ type: "bold", text: "not more than the Cap." }]);
  });

  it("turns an autolink into a link", () => {
    expect(parseInline("at <https://commonpaper.com/a/>.")).toEqual([
      { type: "text", text: "at " },
      {
        type: "link",
        text: "https://commonpaper.com/a/",
        href: "https://commonpaper.com/a/",
      },
      { type: "text", text: "." },
    ]);
  });
});

describe("parseMarkdown numbering", () => {
  const labels = (markdown: string) =>
    parseMarkdown(markdown).flatMap((block) =>
      block.type === "numbered" ? [[block.label, block.depth]] : [],
    );

  it("builds section numbers from nested lists", () => {
    expect(
      labels(
        ["5. Term", "    1. One", "    2. Two", "        a. First", "        b. Second", "6. Next", "    1. Other"].join("\n"),
      ),
    ).toEqual([
      ["5.", 0],
      ["5.1", 1],
      ["5.2", 1],
      ["(a)", 2],
      ["(b)", 2],
      ["6.", 0],
      ["6.1", 1],
    ]);
  });

  it("supports a fourth level", () => {
    expect(labels("1. A\n    1. B\n        a. C\n            i. D")[3]).toEqual(["(i)", 3]);
  });

  it("doesn't treat an unindented word as a list item", () => {
    expect(labels("e.g. this is a sentence")).toEqual([]);
  });
});

describe("every template", () => {
  async function terms(document: DocumentDefinition) {
    return (await loadAgreementTemplates(document)).standardTerms;
  }

  function eachDocument(test: (document: DocumentDefinition) => Promise<void>) {
    return async () => {
      for (const document of documents) await test(document);
    };
  }

  it(
    "parses without leaving markup in the text",
    eachDocument(async (document) => {
      const templates = await loadAgreementTemplates(document);
      const text = [...(templates.coverPage ?? []), ...templates.standardTerms]
        .map(blockText)
        .join("\n");
      expect(text, document.id).not.toMatch(/\*\*|<span|<\/span|<label|<\/label|\]\(|<http|^#|\|/m);
    }),
  );

  it(
    "has no unfilled placeholders in the Standard Terms",
    eachDocument(async (document) => {
      expect(JSON.stringify(await terms(document)), document.id).not.toContain(
        '"type":"placeholder"',
      );
    }),
  );

  it(
    "prints only characters the PDF fonts support",
    eachDocument(async (document) => {
      const text = (await terms(document)).map(blockText).join("\n");
      expect(text.match(UNSUPPORTED_CHARACTER)?.[0], document.id).toBeUndefined();
    }),
  );

  it(
    "keeps the section numbers the template's anchors declare",
    eachDocument(async (document) => {
      const markdown = await readFile(
        join(TEMPLATES_DIRECTORY, document.termsFile),
        "utf8",
      );
      const blocks = parseMarkdown(markdown).filter(
        (block) => block.type === "numbered",
      );
      const lines = markdown.split(/\r?\n/).filter((line) => /^\s*(\d+|[a-z]+)\.\s/.test(line));
      expect(lines.length, document.id).toBe(blocks.length);

      lines.forEach((line, index) => {
        const id = line.match(/<span[^>]*\bid="(\d+(?:\.\d+)?)"/)?.[1];
        if (!id) return;
        const label = blocks[index].label;
        expect(label.replace(/\.$/, ""), `${document.id}: ${line.slice(0, 60)}`).toBe(id);
      });
    }),
  );

  it(
    "has a section for every internal section citation",
    eachDocument(async (document) => {
      const blocks = await terms(document);
      const sections = new Set(
        blocks.flatMap((block) =>
          block.type === "numbered" && block.depth < 2
            ? [block.label.replace(/\.$/, "")]
            : [],
        ),
      );
      const text = blocks.map(blockText).join("\n");
      // Citations to other documents name them, such as "Section 19 of the UK Addendum".
      const citations = text.matchAll(/\bSections? (\d+(?:\.\d+)?)\b(?! of the )/g);
      for (const [citation, section] of citations) {
        expect(sections.has(section), `${document.id}: ${citation}`).toBe(true);
      }
    }),
  );
});
