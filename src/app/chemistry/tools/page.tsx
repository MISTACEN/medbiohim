import { redirect } from "next/navigation";

export default function ChemToolsPage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=solutions");
}
