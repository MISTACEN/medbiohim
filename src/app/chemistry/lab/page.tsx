import { redirect } from "next/navigation";

export default function ChemistryLabPage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=lab");
}
