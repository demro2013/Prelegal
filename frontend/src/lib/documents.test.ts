import { beforeAll, describe, expect, it } from "vitest";
import { buildAgreement, buildKeyTermsPage, NOT_SPECIFIED } from "./agreement";
import { inlineText, type Block } from "./document";
import {
  documentFilename,
  partyValues,
  validateDocument,
  withDefaults,
  type DocumentDefinition,
  type Values,
} from "./documents";
import { loadAgreementTemplates, loadDocuments } from "./loadTemplates";

const PARTIES: Values = {
  "party1.name": "Ada Stone",
  "party1.title": "CEO",
  "party1.company": "Acme & Sons, Inc.",
  "party1.noticeAddress": "ada@acme.example",
  "party2.name": "Sam Reed",
  "party2.title": "COO",
  "party2.company": "Globex",
  "party2.noticeAddress": "1 Main St, Dover, DE",
};

const COMPLETE_NDA: Values = {
  ...PARTIES,
  purpose: "Exploring a reseller partnership.",
  effectiveDate: "2026-11-04",
  termType: "fixed",
  termYears: "2",
  confidentialityType: "fixed",
  confidentialityYears: "5",
  governingLaw: "Delaware",
  jurisdiction: "courts located in New Castle, DE",
  modifications: "",
};

let documents: DocumentDefinition[];
let nda: DocumentDefinition;
let sla: DocumentDefinition;
let psa: DocumentDefinition;

beforeAll(async () => {
  documents = await loadDocuments();
  const find = (id: string) => documents.find((document) => document.id === id)!;
  nda = find("mutual-nda");
  sla = find("service-level-agreement");
  psa = find("professional-services-agreement");
});

function blockText(block: Block): string {
  return block.type === "table"
    ? [block.header, ...block.rows].flat().map(inlineText).join(" ")
    : inlineText(block.content);
}

function pageText(blocks: Block[]): string {
  return blocks.map(blockText).join("\n");
}

describe("withDefaults", () => {
  it("fills suggested values and today's date", () => {
    const values = withDefaults(nda, {}, "2026-11-05");
    expect(values.effectiveDate).toBe("2026-11-05");
    expect(values.termType).toBe("fixed");
    expect(values.termYears).toBe("1");
    expect(values.purpose).toContain("Evaluating");
    expect(values.governingLaw).toBeUndefined();
  });

  it("keeps values that have been set", () => {
    const values = withDefaults(nda, { termYears: "3" }, "2026-11-05");
    expect(values.termYears).toBe("3");
  });
});

describe("partyValues", () => {
  it("keeps only the parties", () => {
    expect(
      partyValues({
        fees: "$5",
        "party1.name": "Ada",
        partyFavors: "x",
        "party3.name": "Sam",
      }),
    ).toEqual({ "party1.name": "Ada" });
  });
});

describe("validateDocument", () => {
  it("accepts complete values, with optional fields empty", () => {
    expect(validateDocument(nda, COMPLETE_NDA)).toEqual({});
  });

  it("reports required fields, then each party, in order", () => {
    const errors = validateDocument(nda, withDefaults(nda, { purpose: " " }, ""));
    expect(Object.keys(errors)).toEqual([
      "purpose",
      "effectiveDate",
      "governingLaw",
      "jurisdiction",
      "party1.company",
      "party1.name",
      "party1.title",
      "party1.noticeAddress",
      "party2.company",
      "party2.name",
      "party2.title",
      "party2.noticeAddress",
    ]);
  });

  it("names parties by the document's roles", () => {
    expect(validateDocument(sla, {})["party2.company"]).toBe(
      "Customer company is still needed.",
    );
  });

  it("doesn't require optional fields", () => {
    const errors = validateDocument(sla, {});
    expect(errors).toHaveProperty("parentAgreement");
    expect(errors).not.toHaveProperty("targetUptime");
  });

  it.each(["0026-11-04", "1899-12-31", "2100-01-01", "20261-11-04"])(
    "rejects the unlikely date %s",
    (effectiveDate) => {
      expect(
        validateDocument(nda, { ...COMPLETE_NDA, effectiveDate }).effectiveDate,
      ).toContain("year from 1900 to 2099");
    },
  );

  it.each(["0", "100", "1.5", "-1", "abc", ""])(
    "rejects %j years for a fixed term",
    (years) => {
      expect(
        validateDocument(nda, { ...COMPLETE_NDA, termYears: years }),
      ).toHaveProperty("termYears");
      expect(
        validateDocument(nda, { ...COMPLETE_NDA, confidentialityYears: years }),
      ).toHaveProperty("confidentialityYears");
    },
  );

  it("ignores years when the option doesn't use them", () => {
    expect(
      validateDocument(nda, {
        ...COMPLETE_NDA,
        termType: "untilTerminated",
        termYears: "",
        confidentialityType: "perpetual",
        confidentialityYears: "",
      }),
    ).toEqual({});
  });

  it("accepts accented Latin characters and typographic punctuation", () => {
    expect(
      validateDocument(nda, {
        ...COMPLETE_NDA,
        "party1.name": "José Müller-Ñandú",
        purpose: "“Evaluating” a deal — for €5",
      }),
    ).toEqual({});
  });

  it("rejects characters the PDF can't display, in optional fields too", () => {
    const errors = validateDocument(nda, {
      ...COMPLETE_NDA,
      "party2.name": "Čapek",
      modifications: "条款",
    });
    expect(errors["party2.name"]).toContain("Party 2 name: Remove “Č”");
    expect(errors.modifications).toContain("条");
  });
});

describe("documentFilename", () => {
  it("includes the document and both company names", () => {
    expect(documentFilename(nda, COMPLETE_NDA)).toBe(
      "Mutual-NDA-Acme-Sons-Inc-Globex.pdf",
    );
    expect(documentFilename(sla, COMPLETE_NDA)).toBe(
      "Service-Level-Agreement-Acme-Sons-Inc-Globex.pdf",
    );
  });

  it("removes characters that are unsafe in a filename", () => {
    expect(
      documentFilename(nda, {
        "party1.company": '../Müller/"Co"',
        "party2.company": "???",
      }),
    ).toBe("Mutual-NDA-Muller-Co.pdf");
  });

  it("falls back when no company has been entered", () => {
    expect(documentFilename(nda, {})).toBe("Mutual-NDA.pdf");
  });
});

describe("buildKeyTermsPage", () => {
  it("lists each value under the template's own term name", () => {
    const text = pageText(buildKeyTermsPage(sla, { targetUptime: "99.9%" }));
    expect(text).toContain("Service Level Agreement");
    expect(text).toContain("Order Form");
    expect(text).toMatch(/Target Uptime\n99\.9%/);
  });

  it("prints 'Not specified' for an empty optional field, as plain text", () => {
    const blocks = buildKeyTermsPage(sla, {});
    const index = blocks.findIndex((block) => blockText(block) === "Support Channel");
    expect(blocks[index + 1]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: NOT_SPECIFIED }],
    });
  });

  it("marks an empty required field as a blank to fill", () => {
    expect(JSON.stringify(buildKeyTermsPage(sla, {}))).toContain(
      '{"type":"field","text":"[Agreement]","filled":false}',
    );
  });

  it("formats dates", () => {
    const pilot = documents.find(({ id }) => id === "pilot-agreement")!;
    expect(
      pageText(buildKeyTermsPage(pilot, { effectiveDate: "2026-01-31" })),
    ).toContain("January 31, 2026");
  });

  it("groups fields under their sections", () => {
    const text = pageText(buildKeyTermsPage(psa, {}));
    expect(text).toContain("Key Terms");
    expect(text).toContain("Statement of Work (SOW)");
    expect(text.indexOf("General Cap Amount")).toBeLessThan(
      text.indexOf("Statement of Work (SOW)\n"),
    );
    expect(text.indexOf("Statement of Work (SOW)\n")).toBeLessThan(text.indexOf("SOW Term"));
  });

  it("uses role names and leaves signatures and dates blank", () => {
    const blocks = buildKeyTermsPage(sla, PARTIES);
    const table = blocks.find((block) => block.type === "table");
    if (table?.type !== "table") throw new Error("expected a table");

    expect(table.header.map(inlineText)).toEqual(["", "PROVIDER", "CUSTOMER"]);
    const row = (label: string) =>
      table.rows.find((cells) => inlineText(cells[0]) === label)!.slice(1).map(inlineText);
    expect(row("Print Name")).toEqual(["Ada Stone", "Sam Reed"]);
    expect(row("Company")).toEqual(["Acme & Sons, Inc.", "Globex"]);
    expect(row("Signature")).toEqual(["", ""]);
    expect(row("Date")).toEqual(["", ""]);
  });

  it("states the incorporated terms and keeps the attribution", () => {
    const text = pageText(buildKeyTermsPage(sla, {}));
    expect(text).toContain(
      "incorporates the Common Paper Service Level Agreement Standard Terms Version 2.0",
    );
    expect(text).toContain("The Standard Terms are unmodified");
    expect(text).toContain("Common Paper");
    expect(text).toContain("CC BY 4.0");
  });

  it("doesn't claim a version the template doesn't state", () => {
    expect(pageText(buildKeyTermsPage(psa, {}))).toContain(
      "incorporates the Professional Services Agreement Standard Terms",
    );
  });

  it("doesn't treat user input as markup", () => {
    const value = "**Bold** | [x](y) <span>";
    expect(JSON.stringify(buildKeyTermsPage(sla, { targetUptime: value }))).toContain(
      `{"type":"field","text":${JSON.stringify(value)},"filled":true}`,
    );
  });
});

describe("buildAgreement", () => {
  it("keeps every document's Standard Terms unchanged", async () => {
    for (const definition of documents) {
      const templates = await loadAgreementTemplates(definition);
      expect(
        buildAgreement(definition, templates, PARTIES).standardTerms,
        definition.id,
      ).toEqual(templates.standardTerms);
    }
  });

  it("generates a page for all but the Mutual NDA, which has its own", async () => {
    for (const definition of documents) {
      const { coverPage } = buildAgreement(
        definition,
        await loadAgreementTemplates(definition),
        PARTIES,
      );
      expect(pageText(coverPage).includes("generated using Prelegal"), definition.id).toBe(
        definition.id !== "mutual-nda",
      );
    }
  });
});
