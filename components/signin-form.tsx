"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Magic link only — no passwords. A matchmaker or client row already exists
 * with their email on it; completing the link proves they own that inbox and a
 * trigger binds the two together.
 *
 * The form says the same thing whatever address is typed, so it can't be used
 * to discover who is or isn't a client of the agency.
 */
export function SignInForm({ next, error, signedInButUnknown }: {
  next?: string;
  error?: string;
  signedInButUnknown: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const redirectTo = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (sendError) {
      setState("failed");
      setMessage(sendError.message);
      return;
    }
    setState("sent");
  }

  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/unicorn-club-logo.png" alt="Unicorn Club"
               style={{ height: 40, width: "auto", display: "inline-block" }} />
        </div>

        {signedInButUnknown ? (
          <div className="notice">
            <strong>You&rsquo;re signed in, but this account isn&rsquo;t set up yet.</strong>{" "}
            Ask your matchmaker to add your email, then use the link they send you.
            <div style={{ marginTop: 16 }}>
              <a className="btn ghost" href="/auth/signout">Sign out</a>
            </div>
          </div>
        ) : state === "sent" ? (
          <div className="notice">
            <strong>Check your inbox.</strong> If {email.trim()} belongs to an account here,
            there&rsquo;s a sign-in link waiting. It expires in an hour.
          </div>
        ) : (
          <form onSubmit={send} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required autoFocus
                     autoComplete="email" value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@example.com" />
            </div>
            <button className="btn" type="submit" disabled={state === "sending"}
                    style={{ padding: 13 }}>
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {(state === "failed" || error) && (
              <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>
                {message || "That link didn't work. Ask for a fresh one."}
              </p>
            )}
            <p style={{
              fontSize: 12, color: "var(--text-muted)", textAlign: "center",
              margin: "8px 0 0", lineHeight: 1.6,
            }}>
              No password. We&rsquo;ll send a link that signs you in.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
