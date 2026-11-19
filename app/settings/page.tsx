import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SoonPage from "@/components/SoonPage";
import Appearance from "@/components/Appearance";
import TitleField from "@/components/TitleField";
import { titleFor } from "@/lib/theme";

export const metadata: Metadata = { title: "Settings · Transitory Things" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
  const m = user.user_metadata || {};
  const name = String(m.first_name || m.full_name || m.name || "").trim().split(/\s+/)[0] || profile?.handle || (user.email || "").split("@")[0];
  return (
    <SoonPage title="Settings">
      <dl className="settings">
        <Appearance />
        <dt>Title</dt>
        <dd><TitleField initial={String(m.page_title || "")} placeholder={titleFor(null, name)} /></dd>
        <dt>Save button</dt>
        <dd><a className="lk" href="/save-button">Set up the save button</a></dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Account</dt>
        <dd>
          <form action="/auth/signout" method="post">
            <button className="lk">Sign out</button>
          </form>
        </dd>
      </dl>
    </SoonPage>
  );
}
