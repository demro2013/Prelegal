import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { loadMndaTemplates } from "@/lib/loadTemplates";
import { buildMndaDocument, defaultValues } from "@/lib/mnda";
import { MndaPdf, splitLongWord } from "./MndaPdf";

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

describe("MndaPdf", () => {
  it("renders the completed agreement as a PDF", async () => {
    const templates = await loadMndaTemplates();
    const document = buildMndaDocument(templates, {
      ...defaultValues,
      effectiveDate: "2026-11-04",
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "Line one\nLine two",
      parties: [
        {
          name: "José Müller",
          title: "CEO",
          company: "Acme & Sons | **Inc**",
          noticeAddress: "1 Main St\nDover, DE",
        },
        {
          name: "Sam Reed",
          title: "COO",
          company: "Globex",
          noticeAddress: "sam@globex.example",
        },
      ],
    });

    const buffer = await renderToBuffer(<MndaPdf document={document} />);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(5000);
  }, 30_000);
});
