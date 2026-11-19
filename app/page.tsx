import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Gallery, { type Thing } from "@/components/Gallery";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("things").select("*").order("created_at", { ascending: false });
  return <Gallery initial={(data as Thing[]) || []} email={user.email || ""} />;
}
