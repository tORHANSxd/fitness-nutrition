import { redirect } from "next/navigation";

export default function BodyPage() {
  redirect("/progress?tab=body");
}
