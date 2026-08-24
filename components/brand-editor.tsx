"use client";

import { useState, useTransition } from "react";
import type { Brand } from "@/lib/types";
import { updateBrandAction } from "@/lib/actions";

const SWATCHES: [keyof Brand, string][] = [
  ["cream", "Page background"],
  ["panel", "Panel"],
  ["inputBg", "Input"],
  ["ink", "Ink"],
  ["text2", "Secondary text"],
  ["textMuted", "Muted text"],
];

/**
 * The whole white-label surface: what a new matchmaker changes to make the
 * client portal theirs. It writes one JSON column, so onboarding an agency
 * needs no deploy.
 */
export function BrandEditor({ agencyId, brand }: { agencyId: string; brand: Brand }) {
  const [draft, setDraft] = useState<Brand>(brand);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(brand);

  const set = <K extends keyof Brand>(key: K, value: Brand[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: 14 }}>Brand</div>

      <div className="field-grid">
        <div className="full">
          <label className="field-label" htmlFor="displayName">Display name</label>
          <input id="displayName" className="input" value={draft.displayName}
                 onChange={(e) => set("displayName", e.target.value)} />
        </div>
        <div className="full">
          <label className="field-label" htmlFor="logoUrl">
            Logo URL <span className="qualifier">· leave blank to use the name in serif</span>
          </label>
          <input id="logoUrl" className="input" value={draft.logoUrl ?? ""}
                 onChange={(e) => set("logoUrl", e.target.value || null)} />
        </div>
        <div>
          <label className="field-label" htmlFor="serif">Display face</label>
          <input id="serif" className="input" value={draft.serif}
                 onChange={(e) => set("serif", e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="sans">Interface face</label>
          <input id="sans" className="input" value={draft.sans}
                 onChange={(e) => set("sans", e.target.value)} />
        </div>
        <div className="full">
          <label className="field-label" htmlFor="confidentiality">
            Confidentiality line <span className="qualifier">· printed on every profile</span>
          </label>
          <input id="confidentiality" className="input" value={draft.confidentialityNote}
                 onChange={(e) => set("confidentialityNote", e.target.value)} />
        </div>
      </div>

      <div className="field-label" style={{ marginTop: 22 }}>Palette</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
        {SWATCHES.map(([key, label]) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="color" value={String(draft[key])} aria-label={label}
                   onChange={(e) => set(key, e.target.value as Brand[typeof key])}
                   style={{ width: 34, height: 34, padding: 0, border: "1px solid var(--hair-16)", background: "none" }} />
            <span>
              <span style={{ display: "block", fontSize: 11, letterSpacing: "0.06em" }}>{label}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{String(draft[key])}</span>
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button className="btn" disabled={!dirty || pending}
                onClick={() => startTransition(() => { void updateBrandAction(agencyId, draft); })}>
          {pending ? "Saving…" : "Save brand"}
        </button>
        <button className="btn ghost" disabled={!dirty} onClick={() => setDraft(brand)}>Reset</button>
      </div>
    </section>
  );
}
