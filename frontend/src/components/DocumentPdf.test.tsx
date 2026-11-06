import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { buildAgreement } from "@/lib/agreement";
import { loadAgreementTemplates, loadDocuments } from "@/lib/loadTemplates";
import { DocumentPdf, splitLongWord } from "./DocumentPdf";

describe("splitLongWord", () => {
  it("leaves ordinary words whole", () => {
    expect(splitLongWord("Confidentiality")).toEqual(["Confidentiality"]);
  });

  it("adds hyphen-free break points without changing the text", () => {
    const email = "legal-notices@globex-corporation.example";
    const parts = splitLongWord(email);
    expect(parts.join("")).toBe(email);
    expect(parts).toContain("");
    expect(parts.slice(0, 3)).toEqual(["legal-", "", "notices@"]);
  });

  it("breaks a long string with no natural break points", () => {
    const word = "x".repeat(40);
    const parts = splitLongWord(word);
    expect(parts.join("")).toBe(word);
    expect(Math.max(...parts.map((part) => part.length))).toBe(16);
  });
});

describe("DocumentPdf", () => {
  it("renders the Mutual NDA with awkward values", async () => {
    const documents = await loadDocuments();
    const definition = documents.find(({ id }) => id === "mutual-nda")!;
    const agreement = buildAgreement(
      definition,
      await loadAgreementTemplates(definition),
      {
        effectiveDate: "2026-11-04",
        termType: "fixed",
        termYears: "1",
        confidentialityType: "fixed",
        confidentialityYears: "1",
        purpose: "Evaluating a deal",
        governingLaw: "Delaware",
        jurisdiction: "New Castle, DE",
        modifications: "Line one\nLine two",
        "party1.name": "José Müller",
        "party1.title": "CEO",
        "party1.company": "Acme & Sons | **Inc**",
        "party1.noticeAddress": "1 Main St\nDover, DE",
        "party2.name": "Sam Reed",
        "party2.title": "COO",
        "party2.company": "Globex",
        "party2.noticeAddress": "sam@globex.example",
      },
    );

    const buffer = await renderToBuffer(
      <DocumentPdf agreement={agreement} definition={definition} />,
    );

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5000);
  }, 30_000);

  it("renders every document, including those with long clauses", async () => {
    const documents = await loadDocuments();
    expect(documents).toHaveLength(11);

    for (const definition of documents) {
      const values = Object.fromEntries(
        definition.fields.map(({ key, type }) => [
          key,
          type === "date" ? "2026-11-04" : type === "years" ? "2" : "A value",
        ]),
      );
      const agreement = buildAgreement(
        definition,
        await loadAgreementTemplates(definition),
        values,
      );
      const buffer = await renderToBuffer(
        <DocumentPdf agreement={agreement} definition={definition} />,
      );
      expect(buffer.subarray(0, 5).toString("latin1"), definition.id).toBe("%PDF-");
    }
  }, 120_000);
});
