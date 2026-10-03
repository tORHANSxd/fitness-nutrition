import { redirect } from "next/navigation";

export default function TemplatesPage() {
  redirect("/resources?tab=templates");
}
