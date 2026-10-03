import { redirect } from "next/navigation";

export default function HistoryPage() {
  redirect("/progress?tab=nutrition");
}

