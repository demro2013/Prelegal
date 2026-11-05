import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdown } from "./document";
import type { MndaDocument } from "./mnda";

/** The dataset lives in the repository root, one level above `frontend/`. */
const TEMPLATES_DIRECTORY = join(process.cwd(), "..", "templates");

async function loadTemplate(filename: string) {
  const markdown = await readFile(join(TEMPLATES_DIRECTORY, filename), "utf8");
  return parseMarkdown(markdown);
}

/** Runs at build time. The templates ship to the browser as parsed data. */
export async function loadMndaTemplates(): Promise<MndaDocument> {
  const [coverPage, standardTerms] = await Promise.all([
    loadTemplate("Mutual-NDA-coverpage.md"),
    loadTemplate("Mutual-NDA.md"),
  ]);
  return { coverPage, standardTerms };
}
