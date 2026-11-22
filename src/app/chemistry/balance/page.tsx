import { redirect } from "next/navigation";

export default function ChemistryBalancePage() {
  redirect("/subjects/chemistry_organic_physical?tab=chem&section=reactions");
}
