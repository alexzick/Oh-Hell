"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { PortalRosterItem, ReactionKey } from "@/lib/types";
import { REACTION, REACTION_KEYS, STATUS } from "@/lib/types";
import { photoStyle, EmptyPhoto } from "@/components/photo";
import { useAutosave } from "@/lib/use-autosave";
import { setFeedbackAction } from "@/lib/actions";

export function PortalProfile({ clientId, clientName, item, confidentialityNote }: {
  clientId: string;
  clientName: string;
  item: PortalRosterItem;
  confidentialityNote: string;
}) {
  const [reaction, setReaction] = useState<ReactionKey | null>(item.feedback.reaction);
  const [, startTransition] = useTransition();
  const { save, state } = useAutosave();
  const c = item.candidate;

  const facts: [string, string][] = [
    ["Age", c.age], ["Based in", c.basedIn], ["Profession", c.profession], ["Faith", c.faith],
  ];

  return (
    <div className="narrow">
      <Link className="back" href={`/portal/${clientId}`}>← Back to roster</Link>

      <div className="panel">
        <div className="panel-top">
          <span className="eyebrow">Selected for {clientName}</span>
          <span className="eyebrow">Confidential</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 20 }}>
          <span className="dot" style={{ background: STATUS[item.status].color }} />
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-2)" }}>
            {STATUS[item.status].label}
          </span>
        </div>

        <h1 className="name-big">{c.name}</h1>
        {item.blurb && <p className="blurb-big">{item.blurb}</p>}

        <hr className="hr" />

        <div className="facts-row">
          <div className="photo plain" style={photoStyle(c.photoUrl, c.photoFrame)}>
            {!c.photoUrl && <EmptyPhoto />}
          </div>
          <div>
            {facts.map(([label, value]) => (
              <div className="fact" key={label}>
                <span className="fact-label">{label}</span>
                <span className="fact-value">{value || "—"}</span>
              </div>
            ))}
          </div>
        </div>

        {c.about && (
          <>
            <hr className="hr" />
            <div className="eyebrow" style={{ letterSpacing: "0.22em", marginBottom: 14 }}>
              Why we&rsquo;re introducing her
            </div>
            <p className="about-text">{c.about}</p>
          </>
        )}

        <hr className="hr" />

        <div className="eyebrow" style={{ letterSpacing: "0.22em", marginBottom: 14 }}>
          What do you think?
        </div>
        <div className="reactions">
          {REACTION_KEYS.map((key) => {
            const active = reaction === key;
            return (
              <button key={key} className="reaction-btn" data-active={active}
                      style={active
                        ? { borderColor: REACTION[key].color, background: `${REACTION[key].color}14` }
                        : undefined}
                      onClick={() => {
                        // Tapping the active choice clears it — a client should
                        // be able to take an answer back.
                        const next = active ? null : key;
                        setReaction(next);
                        startTransition(() => { void setFeedbackAction(item.id, { reaction: next }); });
                      }}>
                <span className="label" style={{ color: REACTION[key].color }}>{REACTION[key].label}</span>
                <span className="verb">{REACTION[key].verb}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "30px 0 12px" }}>
          <span className="eyebrow" style={{ letterSpacing: "0.22em" }}>Your notes</span>
          <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 12, color: "var(--text-faint)" }}>
            {state === "saving" ? "saving…" : state === "saved" ? "saved" : "Shared privately with your matchmaker"}
          </span>
        </div>
        <textarea className="textarea" rows={3} defaultValue={item.feedback.note}
                  aria-label="Your notes"
                  placeholder="Your thoughts — what you'd like us to know, questions, whether you'd like to meet…"
                  onChange={(e) => save("note", () => setFeedbackAction(item.id, { note: e.target.value }))} />

        <p className="confidentiality">{confidentialityNote}</p>
      </div>
    </div>
  );
}
