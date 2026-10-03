import { redirect } from "next/navigation";

export default function MealsPage() {
  redirect("/today?section=meals");
}
