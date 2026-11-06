import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdown, type AgreementTemplates } from "./document";
import type { DocumentDefinition } from "./documents";

/** These live in the repository root, one level above `frontend/`. */
export const TEMPLATES_DIRECTORY = join(process.cwd(), "..", "templates");
const DOCUMENTS_FILE = join(process.cwd(), "..", "documents", "documents.json");

async function loadTemplate(filename: string) {
  const markdown = await readFile(join(TEMPLATES_DIRECTORY, filename), "utf8");
  return parseMarkdown(markdown);
}

/** Runs at build time. The definitions ship to the browser with the page. */
export async function loadDocuments(): Promise<DocumentDefinition[]> {
  return JSON.parse(await readFile(DOCUMENTS_FILE, "utf8"));
}

/** Runs at build time. The browser fetches the result once a document is chosen. */
export async function loadAgreementTemplates(
  document: DocumentDefinition,
): Promise<AgreementTemplates> {
  const [coverPage, standardTerms] = await Promise.all([
    document.coverFile ? loadTemplate(document.coverFile) : undefined,
    loadTemplate(document.termsFile),
  ]);
  return { coverPage, standardTerms };
}
