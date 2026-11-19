"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Passwordless sign-in: enter your email, get a code, type it here.
// The same steps work for new and returning people, in any browser.
export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setMsg(error.message);
    else {
      setStep("code");
      setCode("");
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await createClient().auth.verifyOtp({ email, token: code, type: "email" });
    if (error) {
      setBusy(false);
      setMsg("That code didn't work. Check it, or send a new one.");
    } else {
      window.location.assign("/");
    }
  }

  return (
    <main className="login">
      {step === "email" ? (
        <form onSubmit={sendCode}>
          <h1>
            Transitory <span>Things</span>
          </h1>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
          />
          <button disabled={busy}>{busy ? "Sending…" : "Continue"}</button>
          {msg && <p>{msg}</p>}
        </form>
      ) : (
        <form onSubmit={verify}>
          <h1>
            Transitory <span>Things</span>
          </h1>
          <p>We sent a code to {email}.</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            pattern="[0-9]{6,10}"
            maxLength={10}
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Code"
          />
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          {msg && <p>{msg}</p>}
          <p>
            <a href="#" onClick={(e) => { e.preventDefault(); if (!busy) sendCode(); }}>Send a new code</a>
            {" · "}
            <a href="#" onClick={(e) => { e.preventDefault(); setStep("email"); setMsg(""); }}>Use a different email</a>
          </p>
        </form>
      )}
    </main>
  );
}
