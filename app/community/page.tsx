import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SoonPage from "@/components/SoonPage";

export const metadata: Metadata = { title: "Community · Transitory Things" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <SoonPage title="Community">
      <p>Things other people are keeping, and the people keeping them. Coming soon.</p>
    </SoonPage>
  );
}
