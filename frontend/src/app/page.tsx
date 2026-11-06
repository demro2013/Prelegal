import { DocumentCreator } from "@/components/DocumentCreator";
import { loadDocuments } from "@/lib/loadTemplates";

export default async function Home() {
  const documents = await loadDocuments();
  return <DocumentCreator documents={documents} />;
}
