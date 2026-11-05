import { MndaCreator } from "@/components/MndaCreator";
import { loadMndaTemplates } from "@/lib/loadTemplates";

export default async function Home() {
  const templates = await loadMndaTemplates();
  return <MndaCreator templates={templates} />;
}
