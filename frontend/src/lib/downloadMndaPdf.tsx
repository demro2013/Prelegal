import type { MndaDocument } from "./mnda";

/**
 * Generates the PDF in the browser and saves it. The PDF library is large, so
 * it loads only when someone downloads.
 */
export async function downloadMndaPdf(
  agreement: MndaDocument,
  filename: string,
): Promise<void> {
  const [{ pdf }, { MndaPdf }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/MndaPdf"),
  ]);
  const blob = await pdf(<MndaPdf document={agreement} />).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
