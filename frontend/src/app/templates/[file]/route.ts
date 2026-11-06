import { loadAgreementTemplates, loadDocuments } from "@/lib/loadTemplates";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const documents = await loadDocuments();
  return documents.map((document) => ({ file: `${document.id}.json` }));
}

/** Each document's parsed templates, so a page view loads only the one it needs. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const documents = await loadDocuments();
  const document = documents.find(({ id }) => `${id}.json` === file);
  if (!document) return new Response(null, { status: 404 });
  return Response.json(await loadAgreementTemplates(document));
}
