"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else setState("sent");
  }

  return (
    <main className="login">
      <form onSubmit={send}>
        <h1>
          Transitory <span>Things</span>
        </h1>
        {state === "sent" ? (
          <p>Check {email} for a sign-in link. You can close this tab.</p>
        ) : (
          <>
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <button disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send sign-in link"}</button>
            {state === "error" && <p>{msg}</p>}
          </>
        )}
      </form>
    </main>
  );
}
