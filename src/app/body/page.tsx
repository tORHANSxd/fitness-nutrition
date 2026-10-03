import { redirect } from "next/navigation";

export default function BodyPage() {
  redirect("/records?tab=body");
}
