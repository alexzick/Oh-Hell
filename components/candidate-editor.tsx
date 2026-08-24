"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Candidate, City, ClientFeedback, RosterItem, StatusKey } from "@/lib/types";
import { REACTION, STATUS, STATUS_KEYS } from "@/lib/types";
import { photoStyle, EmptyPhoto } from "@/components/photo";
import { useAutosave } from "@/lib/use-autosave";
import {
  removeRosterItemAction, setNetworkListingAction, setPrivateNoteAction,
  updateCandidateAction, updateRosterItemAction,
} from "@/lib/actions";
import { PhotoReframe } from "@/components/photo-reframe";

const CONSENT_VERSION = "network-consent-v1";

export function CandidateEditor({
  clientId, clientName, item, candidate, ig, source, feedback, cities,
}: {
  clientId: string;
  clientName: string;
  item: RosterItem;
  candidate: Candidate;
  ig: string;
  source: string;
  feedback: ClientFeedback | null;
  cities: City[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { save, state } = useAutosave();
  const [reframing, setReframing] = useState(false);
  const [photo, setPhoto] = useState(candidate.photoUrl);
  const [frame, setFrame] = useState(candidate.photoFrame);

  const saveCandidate = (key: string, patch: Parameters<typeof updateCandidateAction>[1]) =>
    save(key, () => updateCandidateAction(candidate.id, patch));
  const saveItem = (key: string, patch: Partial<RosterItem>) =>
    save(key, () => updateRosterItemAction(item.id, patch));

  async function onPickPhoto(file: File) {
    // Demo path: inline the image so the prototype's drag-and-drop behaviour
    // survives with no storage bucket. With Supabase configured this should
    // upload to the `candidate-photos` bucket and store the object path
    // instead — see docs/architecture.md, "Photos".
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const nextFrame = { x: 50, y: 50, zoom: 1 };
    setPhoto(url);
    setFrame(nextFrame);
    startTransition(() => {
      void updateCandidateAction(candidate.id, { photoUrl: url, photoFrame: nextFrame });
    });
  }

  return (
    <div className="narrow">
      <Link className="back" href={`/app/clients/${clientId}`}>← Back to roster</Link>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <span className="micro">
          Editing — internal record
          {state !== "idle" && (
            <span style={{ marginLeft: 12, color: "var(--text-faint)" }}>
              {state === "saving" ? "saving…" : "saved"}
            </span>
          )}
        </span>
        <button className="btn danger" onClick={() => {
          if (!window.confirm(`Remove ${candidate.name} from ${clientName}'s roster?`)) return;
          startTransition(() => {
            void removeRosterItemAction(item.id).then(() => router.push(`/app/clients/${clientId}`));
          });
        }}>Delete</button>
      </div>

      <div className="editor-cols">
        <div>
          <label className="photo" style={{ ...photoStyle(photo, frame), cursor: "pointer" }}
                 onDoubleClick={() => photo && setReframing(true)}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => {
                   e.preventDefault();
                   const file = e.dataTransfer.files?.[0];
                   if (file?.type.startsWith("image/")) void onPickPhoto(file);
                 }}>
            {!photo && <EmptyPhoto label="Drop photo" />}
            <input type="file" accept="image/*" style={{ display: "none" }}
                   onChange={(e) => {
                     const file = e.target.files?.[0];
                     if (file) void onPickPhoto(file);
                   }} />
          </label>
          {photo && <div className="micro" style={{ marginTop: 8, letterSpacing: "0.02em", textTransform: "none" }}>
            Double-click to reframe
          </div>}

          <div className="field-label" style={{ marginTop: 22 }}>Status</div>
          <div className="status-picker">
            {STATUS_KEYS.map((key) => (
              <button key={key} className="status-opt"
                      style={item.status === key
                        ? { borderColor: STATUS[key].color, background: `${STATUS[key].color}1f` }
                        : undefined}
                      onClick={() => startTransition(() => {
                        void updateRosterItemAction(item.id, { status: key as StatusKey });
                      })}>
                <span className="dot" style={{ background: STATUS[key].color }} />
                {STATUS[key].label}
              </button>
            ))}
          </div>

          <label className="field-label" style={{ marginTop: 22 }} htmlFor="city">City</label>
          <select id="city" className="select" defaultValue={item.cityId ?? ""}
                  onChange={(e) => startTransition(() => {
                    void updateRosterItemAction(item.id, { cityId: e.target.value || null });
                  })}>
            <option value="">Ungrouped</option>
            {cities.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <div className="field-grid">
            <div className="full">
              <label className="field-label" htmlFor="name">Name</label>
              <input id="name" className="input" defaultValue={candidate.name}
                     onChange={(e) => saveCandidate("name", { name: e.target.value })} />
            </div>
            <Field id="age" label="Age" value={candidate.age}
                   onChange={(v) => saveCandidate("age", { age: v })} />
            <Field id="basedIn" label="Based in" value={candidate.basedIn}
                   onChange={(v) => saveCandidate("basedIn", { basedIn: v })} />
            <Field id="profession" label="Profession" value={candidate.profession}
                   onChange={(v) => saveCandidate("profession", { profession: v })} />
            <Field id="faith" label="Faith" value={candidate.faith}
                   onChange={(v) => saveCandidate("faith", { faith: v })} />
            <Field id="ig" label="Instagram" value={ig}
                   onChange={(v) => saveCandidate("ig", { ig: v })} />
            <Field id="source" label="Source / referral" value={source}
                   onChange={(v) => saveCandidate("source", { source: v })} />
          </div>

          <div style={{ marginTop: 22 }}>
            <label className="field-label" htmlFor="blurb">
              Why she&rsquo;s a match <span className="qualifier">· shown to {clientName}</span>
            </label>
            <textarea id="blurb" className="textarea" rows={2} defaultValue={item.blurb}
                      onChange={(e) => saveItem("blurb", { blurb: e.target.value })} />
          </div>

          <div style={{ marginTop: 16 }}>
            <label className="field-label" htmlFor="about">
              Introduction <span className="qualifier">· shown to {clientName}</span>
            </label>
            <textarea id="about" className="textarea" rows={4} defaultValue={candidate.about}
                      onChange={(e) => saveCandidate("about", { about: e.target.value })} />
          </div>

          <div className="block private">
            <div className="block-label">
              Private notes · internal only — never shown to {clientName}
            </div>
            <textarea className="textarea" rows={3} defaultValue={item.privateNote}
                      placeholder="Your candid notes, logistics, reactions…"
                      aria-label="Private matchmaker notes"
                      onChange={(e) => save("note", () => setPrivateNoteAction(item.id, e.target.value))} />
          </div>

          <div className="block feedback">
            <div className="block-label">
              <span className="dot" style={{ background: "var(--status-yes)" }} />
              {clientName}&rsquo;s response · from their portal
            </div>
            {feedback?.reaction && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span className="dot" style={{ background: REACTION[feedback.reaction].color }} />
                <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
                  {REACTION[feedback.reaction].label}
                </span>
              </div>
            )}
            {feedback?.note?.trim()
              ? <div className="block-text">{feedback.note}</div>
              : <div className="block-empty">
                  {feedback?.reaction ? "No written note." : `Nothing from ${clientName} yet.`}
                </div>}
          </div>

          <NetworkListing candidate={candidate} />

          <Link className="btn ghost" href={`/portal/${clientId}/${item.id}`}
                style={{ display: "block", textAlign: "center", marginTop: 24, padding: 13 }}>
            Preview {clientName}&rsquo;s view →
          </Link>
        </div>
      </div>

      {reframing && photo && (
        <PhotoReframe
          url={photo}
          frame={frame ?? { x: 50, y: 50, zoom: 1 }}
          onCommit={(next) => {
            setFrame(next);
            setReframing(false);
            startTransition(() => { void updateCandidateAction(candidate.id, { photoFrame: next }); });
          }}
        />
      )}
    </div>
  );
}

function Field({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} className="input" defaultValue={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * Listing a woman in the cross-agency network is a consent decision about a
 * real person, so the control states plainly what is shared and records which
 * consent text she agreed to. The database refuses the listing without it.
 */
function NetworkListing({ candidate }: { candidate: Candidate }) {
  const [, startTransition] = useTransition();
  const listed = candidate.networkListed;

  return (
    <div className="block" style={{ border: "1px solid var(--hair-16)", background: "var(--input-bg)" }}>
      <div className="block-label" style={{ color: "var(--text-2)" }}>Matchmaker network</div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-2)", margin: "0 0 12px" }}>
        {listed
          ? "Listed. Other agencies can see an anonymized card — age band, metro, profession category — and must request an introduction from you before seeing anything more."
          : "Not listed. Nothing about her is visible to other agencies."}
      </p>
      <button className="btn ghost" onClick={() => {
        if (listed) {
          startTransition(() => { void setNetworkListingAction(candidate.id, { listed: false }); });
          return;
        }
        const ok = window.confirm(
          `Confirm that ${candidate.name} has agreed to be listed anonymously in the matchmaker network.\n\n` +
          "Other agencies will see: age band, metro, profession category, faith and your one-line headline.\n" +
          "They will not see: her name, photo, handles or your notes.\n\n" +
          "Her consent will be recorded against this account.",
        );
        if (!ok) return;
        startTransition(() => {
          void setNetworkListingAction(candidate.id, {
            listed: true,
            consentVersion: CONSENT_VERSION,
            metro: candidate.basedIn,
            professionCategory: candidate.profession,
          });
        });
      }}>
        {listed ? "Remove from network" : "List anonymously"}
      </button>
    </div>
  );
}
