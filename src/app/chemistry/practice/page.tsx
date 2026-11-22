import { redirect } from "next/navigation";

export default function ChemistryPracticePage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=practice");
}
