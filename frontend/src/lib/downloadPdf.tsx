import type { Agreement } from "./document";
import type { DocumentDefinition } from "./documents";

/**
 * Generates the PDF in the browser and saves it. The PDF library is large, so
 * it loads only when someone downloads.
 */
export async function downloadPdf(
  agreement: Agreement,
  definition: DocumentDefinition,
  filename: string,
): Promise<void> {
  const [{ pdf }, { DocumentPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/DocumentPdf"),
  ]);
  const blob = await pdf(
    <DocumentPdf agreement={agreement} definition={definition} />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
