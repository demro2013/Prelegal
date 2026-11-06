import { beforeAll, describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdown, type Block } from "./document";
import { loadAgreementTemplates, loadDocuments } from "./loadTemplates";
import { fillCoverPage, formatDate, type MndaValues } from "./mnda";

const emptyParty = { name: "", title: "", company: "", noticeAddress: "" };

const defaultValues: MndaValues = {
  purpose: "Evaluating a business relationship.",
  effectiveDate: "",
  termType: "fixed",
  termYears: "1",
  confidentialityType: "fixed",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  parties: [emptyParty, emptyParty],
};

const completeValues: MndaValues = {
  ...defaultValues,
  purpose: "Exploring a reseller partnership.",
  effectiveDate: "2026-11-04",
  termYears: "2",
  confidentialityYears: "5",
  governingLaw: "Delaware",
  jurisdiction: "courts located in New Castle, DE",
  parties: [
    {
      name: "Ada Stone",
      title: "CEO",
      company: "Acme & Sons, Inc.",
      noticeAddress: "ada@acme.example",
    },
    {
      name: "Sam Reed",
      title: "COO",
      company: "Globex",
      noticeAddress: "1 Main St, Dover, DE",
    },
  ],
};

let coverPage: Block[];
let standardTerms: Block[];

beforeAll(async () => {
  const documents = await loadDocuments();
  const templates = await loadAgreementTemplates(
    documents.find(({ id }) => id === "mutual-nda")!,
  );
  coverPage = templates.coverPage!;
  standardTerms = templates.standardTerms;
});

function blockText(block: Block): string {
  return block.type === "table"
    ? [block.header, ...block.rows].flat().map(inlineText).join(" ")
    : inlineText(block.content);
}

function coverText(values: MndaValues): string {
  return fillCoverPage(coverPage, values).map(blockText).join("\n");
}

function checkboxes(values: MndaValues) {
  return fillCoverPage(coverPage, values).filter(
    (block) => block.type === "checkbox",
  );
}

describe("parseInline", () => {
  it("recognizes each inline type", () => {
    expect(
      parseInline(
        'a **b** [c](https://d.example) <span class="coverpage_link">e</span> <label>f</label> [g]',
      ),
    ).toEqual([
      { type: "text", text: "a " },
      { type: "bold", text: "b" },
      { type: "text", text: " " },
      { type: "link", text: "c", href: "https://d.example" },
      { type: "text", text: " " },
      { type: "term", text: "e" },
      { type: "text", text: " " },
      { type: "hint", text: "f" },
      { type: "text", text: " " },
      { type: "placeholder", text: "g" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("handles CRLF line endings", () => {
    expect(parseMarkdown("# One\r\n\r\nTwo\r\n")).toEqual([
      { type: "heading", level: 1, content: [{ type: "text", text: "One" }] },
      { type: "paragraph", content: [{ type: "text", text: "Two" }] },
    ]);
  });

  it("pads table rows that omit trailing cells", () => {
    const [table] = parseMarkdown("|| A | B |\n|:--|:--|:--|\n| Row | |\n| Short |");
    if (table.type !== "table") throw new Error("expected a table");
    expect(table.header.map(inlineText)).toEqual(["", "A", "B"]);
    expect(table.rows.map((row) => row.length)).toEqual([3, 3]);
  });
});

describe("Mutual NDA templates", () => {
  it("contain all 11 sections of the Standard Terms in order", () => {
    const labels = standardTerms.flatMap((block) =>
      block.type === "numbered" ? [block.label] : [],
    );
    expect(labels).toEqual(
      ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11."],
    );
  });
});

describe("fillCoverPage", () => {
  it("leaves no placeholder unprocessed", () => {
    expect(JSON.stringify(fillCoverPage(coverPage, completeValues))).not.toContain(
      '"type":"placeholder"',
    );
  });

  it("fills in each term", () => {
    const text = coverText(completeValues);
    for (const expected of [
      "Exploring a reseller partnership.",
      "November 4, 2026",
      "Expires 2 years from Effective Date.",
      "5 years from Effective Date, but in the case of trade secrets",
      "Governing Law: Delaware",
      "Jurisdiction: courts located in New Castle, DE",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("Fill in");
    expect(text).not.toContain("Today’s date");
  });

  it("fills in both parties and leaves signature and date blank", () => {
    const table = fillCoverPage(coverPage, completeValues).find(
      (block) => block.type === "table",
    );
    if (table?.type !== "table") throw new Error("expected a table");
    const row = (label: string) =>
      table.rows
        .find((cells) => inlineText(cells[0]).startsWith(label))!
        .slice(1)
        .map(inlineText);

    expect(row("Print Name")).toEqual(["Ada Stone", "Sam Reed"]);
    expect(row("Title")).toEqual(["CEO", "COO"]);
    expect(row("Company")).toEqual(["Acme & Sons, Inc.", "Globex"]);
    expect(row("Notice Address")).toEqual([
      "ada@acme.example",
      "1 Main St, Dover, DE",
    ]);
    expect(row("Signature")).toEqual(["", ""]);
    expect(row("Date")).toEqual(["", ""]);
  });

  it("uses a singular year", () => {
    expect(coverText({ ...completeValues, termYears: "1" })).toContain(
      "Expires 1 year from Effective Date.",
    );
  });

  it("checks only the selected term options", () => {
    expect(checkboxes(completeValues).map((box) => box.checked)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(
      checkboxes({
        ...completeValues,
        termType: "untilTerminated",
        confidentialityType: "perpetual",
      }).map((box) => box.checked),
    ).toEqual([false, true, false, true]);
  });

  it("keeps template wording for an option that is not selected", () => {
    const text = coverText({ ...completeValues, termType: "untilTerminated" });
    expect(text).toContain("Expires [1 year(s)] from Effective Date.");
    expect(text).not.toContain("Expires 2 years");
  });

  it("states when there are no modifications", () => {
    const text = coverText(completeValues);
    expect(text).toContain("None.");
    expect(text).not.toContain("List any modifications");
    expect(JSON.stringify(fillCoverPage(coverPage, completeValues))).toContain(
      '{"type":"field","text":"None.","filled":true}',
    );
    expect(
      coverText({ ...completeValues, modifications: "Section 8 is removed." }),
    ).toContain("Section 8 is removed.");
  });

  it("does not treat user input as markup", () => {
    const company = "**Bold** | [x](y) <span>";
    const values = structuredClone(completeValues);
    values.parties[0].company = company;
    values.governingLaw = "[Fill in state]";
    const cover = fillCoverPage(coverPage, values);
    expect(cover.map(blockText).join("\n")).toContain(company);
    expect(JSON.stringify(cover)).toContain(
      `{"type":"field","text":${JSON.stringify(company)},"filled":true}`,
    );
  });

  it("marks blanks as unfilled until they have a value", () => {
    expect(JSON.stringify(fillCoverPage(coverPage, defaultValues))).toContain(
      '{"type":"field","text":"[Fill in state]","filled":false}',
    );
  });

  it("keeps the license attribution on both sheets", () => {
    expect(coverText(completeValues)).toContain("free to use under CC BY 4.0");
    expect(standardTerms.map(blockText).join("\n")).toContain(
      "free to use under CC BY 4.0",
    );
  });

  it("notes that the Cover Page was completed", () => {
    expect(coverText(completeValues)).toContain(
      "Cover Page completed using Prelegal.",
    );
  });
});

describe("formatDate", () => {
  it("does not shift the date across time zones", () => {
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("does not turn a partly typed year into the 1900s", () => {
    expect(formatDate("0026-11-04")).not.toContain("19");
  });
});
