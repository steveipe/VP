import { redirect } from "next/navigation";

export default function Page() {
  // Redirect directly to proposal builder (no Supabase dependency)
  redirect("/apply");
}

