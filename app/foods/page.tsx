import { redirect } from "next/navigation";

export default function FoodsPage() {
  redirect("/resources?tab=foods");
}

