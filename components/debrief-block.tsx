"use client";

import { useState, useTransition } from "react";
import type { Debrief, DispositionKey, OutcomeSummary } from "@/lib/types";
import { DISPOSITION, DISPOSITION_KEYS } from "@/lib/types";
import { useAutosave } from "@/lib/use-autosave";
import { logIntroductionAction, saveInternalDebriefAction } from "@/lib/actions";

/**
 * The matchmaker's side of the debrief: her account (relayed), their own read,
 * and a read-only view of what the client wrote. The client's account is shown
 * here and nowhere else — it never travels back the other way.
 */
export function DebriefBlock({ rosterItemId, candidateName, clientName, introductionId, outcome }: {
  rosterItemId: string;
  candidateName: string;
  clientName: string;
  introductionId: string | null;
  outcome: OutcomeSummary | null;
}) {
  const [pending, startTransition] = useTransition();

  if (!introductionId) {
    return (
      <div className="block" style={{ border: "1px solid var(--hair-16)", background: "var(--input-bg)" }}>
        <div className="block-label" style={{ color: "var(--text-2)" }}>After the introduction</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", margin: "0 0 12px" }}>
          Once they&rsquo;ve met, log it here — that opens the debrief for both sides and asks
          {" "}{clientName} how it went in their portal.
        </p>
        <button className="btn ghost" disabled={pending}
                onClick={() => startTransition(() => { void logIntroductionAction(rosterItemId); })}>
          {pending ? "…" : "They met"}
        </button>
      </div>
    );
  }

  const client = outcome?.client ?? null;
  const candidate = outcome?.candidate ?? null;
  const own = outcome?.matchmaker ?? null;

  return (
    <div className="block" style={{ border: "1px solid var(--hair-16)", background: "var(--input-bg)" }}>
      <div className="block-label" style={{ color: "var(--text-2)" }}>The debrief</div>

      {outcome?.divergent && (
        <div style={{
          border: "1px solid var(--client-border)", background: "var(--client-bg)",
          padding: "10px 12px", marginBottom: 14, fontSize: 13, lineHeight: 1.5,
        }}>
          <strong>They don&rsquo;t agree.</strong> {clientName} said{" "}
          {client?.disposition && DISPOSITION[client.disposition].label.toLowerCase()};{" "}
          {candidateName} said{" "}
          {candidate?.disposition && DISPOSITION[candidate.disposition].label.toLowerCase()}.
        </div>
      )}

      <Account
        title={`${clientName}'s account`}
        hint="written in their portal · you cannot edit this"
        debrief={client}
        readOnly
        emptyText={`Nothing from ${clientName} yet.`}
      />

      <Account
        title={`${candidateName}'s account`}
        hint="as she told you · recorded as relayed, not first-hand"
        debrief={candidate}
        placeholder={`What ${candidateName} said about the evening…`}
        onSave={(patch) => saveInternalDebriefAction(introductionId, "candidate", patch)}
      />

      <Account
        title="Your read"
        hint="never shown to either of them"
        debrief={own}
        placeholder="What you make of it — and what it changes about the next introduction…"
        onSave={(patch) => saveInternalDebriefAction(introductionId, "self", patch)}
        noDisposition
      />
    </div>
  );
}

function Account({
  title, hint, debrief, placeholder, onSave, readOnly, noDisposition, emptyText,
}: {
  title: string;
  hint: string;
  debrief: Debrief | null;
  placeholder?: string;
  onSave?: (patch: { disposition?: DispositionKey | null; body?: string }) => Promise<void>;
  readOnly?: boolean;
  noDisposition?: boolean;
  emptyText?: string;
}) {
  const { save, state } = useAutosave();
  const [, startTransition] = useTransition();
  const [disposition, setDisposition] = useState<DispositionKey | null>(debrief?.disposition ?? null);

  return (
    <div style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid var(--hair-10)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic", fontFamily: "var(--serif)" }}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : hint}
        </span>
      </div>

      {!noDisposition && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", margin: "12px 0" }}>
          {DISPOSITION_KEYS.map((key) => {
            const active = disposition === key;
            const d = DISPOSITION[key];
            return (
              <button key={key} className="chip" data-active={false} disabled={readOnly}
                      title={d.hint}
                      style={{
                        borderColor: active ? d.color : undefined,
                        background: active ? `${d.color}1f` : undefined,
                        opacity: readOnly && !active ? 0.4 : 1,
                        cursor: readOnly ? "default" : "pointer",
                      }}
                      onClick={() => {
                        if (readOnly || !onSave) return;
                        const next = active ? null : key;
                        setDisposition(next);
                        startTransition(() => { void onSave({ disposition: next }); });
                      }}>
                <span className="dot" style={{ background: d.color }} />
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {readOnly ? (
        debrief?.body?.trim()
          ? <div className="block-text">{debrief.body}</div>
          : <div className="block-empty">{emptyText}</div>
      ) : (
        <textarea className="textarea" rows={3} defaultValue={debrief?.body ?? ""}
                  placeholder={placeholder} aria-label={title}
                  onChange={(e) => onSave && save(title, () => onSave({ body: e.target.value }))} />
      )}
    </div>
  );
}
