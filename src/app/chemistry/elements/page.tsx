import { redirect } from "next/navigation";

export default function ChemistryElementsPage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=elements");
}
