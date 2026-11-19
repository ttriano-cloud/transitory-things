import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SoonPage from "@/components/SoonPage";
import Appearance from "@/components/Appearance";

export const metadata: Metadata = { title: "Settings · Transitory Things" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <SoonPage title="Settings">
      <dl className="settings">
        <Appearance />
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
