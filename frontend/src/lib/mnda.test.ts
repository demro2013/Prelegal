import { beforeAll, describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdown, type Block } from "./document";
import { loadMndaTemplates } from "./loadTemplates";
import {
  buildMndaDocument,
  defaultValues,
  formatDate,
  mndaFilename,
  validateMnda,
  type MndaDocument,
  type MndaValues,
} from "./mnda";

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

let templates: MndaDocument;

beforeAll(async () => {
  templates = await loadMndaTemplates();
});

function blockText(block: Block): string {
  return block.type === "table"
    ? [block.header, ...block.rows].flat().map(inlineText).join(" ")
    : inlineText(block.content);
}

function coverText(values: MndaValues): string {
  return buildMndaDocument(templates, values)
    .coverPage.map(blockText)
    .join("\n");
}

function checkboxes(values: MndaValues) {
  return buildMndaDocument(templates, values).coverPage.filter(
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
  it("parse without leaving any markup in the text", () => {
    const text = [...templates.coverPage, ...templates.standardTerms]
      .map(blockText)
      .join("\n");
    expect(text).not.toMatch(/\*\*|<span|<\/span|<label|<\/label|\]\(|^#|\|/m);
  });

  it("contain all 11 sections of the Standard Terms in order", () => {
    const numbers = templates.standardTerms.flatMap((block) =>
      block.type === "numbered" ? [block.number] : [],
    );
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("buildMndaDocument", () => {
  it("leaves no placeholder unprocessed", () => {
    const cover = JSON.stringify(
      buildMndaDocument(templates, completeValues).coverPage,
    );
    expect(cover).not.toContain('"type":"placeholder"');
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
    const table = buildMndaDocument(templates, completeValues).coverPage.find(
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
    expect(
      JSON.stringify(buildMndaDocument(templates, completeValues).coverPage),
    ).toContain('{"type":"field","text":"None.","filled":true}');
    expect(
      coverText({ ...completeValues, modifications: "Section 8 is removed." }),
    ).toContain("Section 8 is removed.");
  });

  it("does not treat user input as markup", () => {
    const company = "**Bold** | [x](y) <span>";
    const values = structuredClone(completeValues);
    values.parties[0].company = company;
    values.governingLaw = "[Fill in state]";
    const cover = buildMndaDocument(templates, values).coverPage;
    expect(cover.map(blockText).join("\n")).toContain(company);
    expect(JSON.stringify(cover)).toContain(
      `{"type":"field","text":${JSON.stringify(company)},"filled":true}`,
    );
  });

  it("marks blanks as unfilled until they have a value", () => {
    const cover = JSON.stringify(
      buildMndaDocument(templates, defaultValues).coverPage,
    );
    expect(cover).toContain(
      '{"type":"field","text":"[Fill in state]","filled":false}',
    );
  });

  it("keeps the Standard Terms and the license attribution", () => {
    const document = buildMndaDocument(templates, completeValues);
    expect(document.standardTerms).toEqual(templates.standardTerms);
    expect(document.coverPage.map(blockText).join("\n")).toContain(
      "free to use under CC BY 4.0",
    );
    expect(document.standardTerms.map(blockText).join("\n")).toContain(
      "free to use under CC BY 4.0",
    );
  });

  it("notes that the Cover Page was completed", () => {
    expect(coverText(completeValues)).toContain(
      "Cover Page completed using Prelegal.",
    );
  });
});

describe("validateMnda", () => {
  it("accepts complete values, with modifications optional", () => {
    expect(validateMnda(completeValues)).toEqual({});
  });

  it("reports each required field in form order", () => {
    const errors = validateMnda({ ...defaultValues, purpose: " " });
    expect(Object.keys(errors)).toEqual([
      "purpose",
      "effectiveDate",
      "governingLaw",
      "jurisdiction",
      "parties.0.company",
      "parties.0.name",
      "parties.0.title",
      "parties.0.noticeAddress",
      "parties.1.company",
      "parties.1.name",
      "parties.1.title",
      "parties.1.noticeAddress",
    ]);
  });

  it.each(["0026-11-04", "1899-12-31", "2100-01-01", "20261-11-04"])(
    "rejects the unlikely date %s",
    (effectiveDate) => {
      expect(validateMnda({ ...completeValues, effectiveDate })).toHaveProperty(
        "effectiveDate",
        "Enter a year from 1900 to 2099.",
      );
    },
  );

  it.each(["0", "100", "1.5", "-1", "abc", ""])(
    "rejects %j years for a fixed term",
    (years) => {
      expect(
        validateMnda({ ...completeValues, termYears: years }),
      ).toHaveProperty("termYears");
      expect(
        validateMnda({ ...completeValues, confidentialityYears: years }),
      ).toHaveProperty("confidentialityYears");
    },
  );

  it("ignores years when the option does not use them", () => {
    expect(
      validateMnda({
        ...completeValues,
        termType: "untilTerminated",
        termYears: "",
        confidentialityType: "perpetual",
        confidentialityYears: "",
      }),
    ).toEqual({});
  });

  it("accepts accented Latin characters and typographic punctuation", () => {
    const values = structuredClone(completeValues);
    values.parties[0].name = "José Müller-Ñandú";
    values.purpose = "“Evaluating” a deal — for €5";
    expect(validateMnda(values)).toEqual({});
  });

  it("rejects characters the PDF cannot display", () => {
    const values = structuredClone(completeValues);
    values.parties[1].name = "Čapek";
    values.modifications = "条款";
    const errors = validateMnda(values);
    expect(errors["parties.1.name"]).toContain("Č");
    expect(errors.modifications).toContain("条");
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

describe("mndaFilename", () => {
  it("includes both company names", () => {
    expect(mndaFilename(completeValues)).toBe(
      "Mutual-NDA-Acme-Sons-Inc-Globex.pdf",
    );
  });

  it("removes characters that are unsafe in a filename", () => {
    const values = structuredClone(completeValues);
    values.parties[0].company = '../Müller/"Co"';
    values.parties[1].company = "???";
    expect(mndaFilename(values)).toBe("Mutual-NDA-Muller-Co.pdf");
  });

  it("falls back when no company has been entered", () => {
    expect(mndaFilename(defaultValues)).toBe("Mutual-NDA.pdf");
  });
});
