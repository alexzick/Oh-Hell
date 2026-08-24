"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { City, ReactionKey, StatusKey } from "@/lib/types";
import { REACTION, STATUS, STATUS_KEYS } from "@/lib/types";
import { photoStyle, EmptyPhoto } from "@/components/photo";
import {
  addCandidateAction, addCityAction, copyCandidatesAction, deleteCityAction,
  removeRosterItemAction, renameCityAction, reorderRosterAction, shareRosterAction,
} from "@/lib/actions";

export interface RosterCard {
  itemId: string;
  candidateId: string;
  name: string;
  age: string;
  basedIn: string;
  photoUrl: string | null;
  photoFrame: { x: number; y: number; zoom: number } | null;
  cityId: string | null;
  status: StatusKey;
  blurb: string;
  ig: string;
  hasFeedback: boolean;
  reaction: ReactionKey | null;
}

export function RosterView({
  clientId, clientName, rosterId, rosterShared, cities, cards, otherClients,
}: {
  clientId: string;
  clientName: string;
  rosterId: string | null;
  rosterShared: boolean;
  cities: City[];
  cards: RosterCard[];
  otherClients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [city, setCity] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusKey>("all");
  const [search, setSearch] = useState("");
  const [editingCities, setEditingCities] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);

  const ordered = useMemo(() => {
    if (!order) return cards;
    const byId = new Map(cards.map((c) => [c.itemId, c]));
    return order.flatMap((id) => { const c = byId.get(id); return c ? [c] : []; });
  }, [cards, order]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordered.filter((c) =>
      (city === "all" || c.cityId === city) &&
      (statusFilter === "all" || c.status === statusFilter) &&
      (!q || c.name.toLowerCase().includes(q)));
  }, [ordered, city, statusFilter, search]);

  const countFor = (key: string) =>
    key === "all" ? cards.length : cards.filter((c) => c.cityId === key).length;

  function commitDrop(targetItemId: string) {
    if (!dragId || dragId === targetItemId || !rosterId) return;
    const ids = ordered.map((c) => c.itemId).filter((id) => id !== dragId);
    const at = ids.indexOf(targetItemId);
    ids.splice(at < 0 ? ids.length : at, 0, dragId);
    setOrder(ids);
    startTransition(() => { void reorderRosterAction(rosterId, ids); });
  }

  function toggleSelected(itemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function copyTo(targetClientId: string) {
    const candidateIds = ordered.filter((c) => selected.has(c.itemId)).map((c) => c.candidateId);
    if (!candidateIds.length) return;
    startTransition(async () => {
      const count = await copyCandidatesAction(candidateIds, targetClientId);
      setSelected(new Set());
      setSelecting(false);
      const target = otherClients.find((c) => c.id === targetClientId);
      window.alert(
        `Copied ${count} ${count === 1 ? "profile" : "profiles"} to ${target?.name ?? "the roster"}.\n\n` +
        "Status, match note and private note start blank — those describe a pairing, not a person.",
      );
      router.push(`/app/clients/${targetClientId}`);
    });
  }

  const feedbackCount = cards.filter((c) => c.hasFeedback).length;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Candidates for {clientName}</h1>
        <div className="page-sub">
          {rosterShared ? "Shared roster" : "Draft — not yet shared"} · {cards.length}{" "}
          {cards.length === 1 ? "candidate" : "candidates"}
          {feedbackCount > 0 && ` · ${feedbackCount} with feedback`}
        </div>
      </div>

      <div className="city-bar">
        {editingCities ? (
          <div className="city-edit-row">
            {cities.map((c) => (
              <div className="city-pill" key={c.id}>
                <input defaultValue={c.label} aria-label={`Rename ${c.label}`}
                       onBlur={(e) => {
                         const value = e.target.value.trim();
                         if (value && value !== c.label) {
                           startTransition(() => { void renameCityAction(c.id, value); });
                         }
                       }} />
                <button className="pill-x" title={`Delete ${c.label}`} onClick={() => {
                  if (cities.length <= 1) { window.alert("Keep at least one city."); return; }
                  if (!window.confirm(`Delete ${c.label}? Her candidates move to ${cities.find((x) => x.id !== c.id)!.label}.`)) return;
                  startTransition(() => { void deleteCityAction(c.id); });
                }}>×</button>
              </div>
            ))}
            <button className="add-city" onClick={() => {
              const label = window.prompt("New city name:");
              if (label?.trim()) startTransition(() => { void addCityAction(clientId, label.trim()); });
            }}>+ Add city</button>
            <button className="btn" style={{ marginLeft: "auto" }}
                    onClick={() => setEditingCities(false)}>Done</button>
          </div>
        ) : (
          <>
            <div className="city-tabs">
              <button className="city-tab" data-active={city === "all"} onClick={() => setCity("all")}>
                All <span className="city-count">{countFor("all")}</span>
              </button>
              {cities.map((c) => (
                <button key={c.id} className="city-tab" data-active={city === c.id}
                        onClick={() => setCity(c.id)}>
                  {c.label} <span className="city-count">{countFor(c.id)}</span>
                </button>
              ))}
            </div>
            <button className="add-city" style={{ border: "none" }}
                    onClick={() => setEditingCities(true)}>✎ Edit cities</button>
          </>
        )}
      </div>

      <div className="main">
        <div className="toolbar">
          <div className="chips">
            <button className="chip" data-active={statusFilter === "all"}
                    onClick={() => setStatusFilter("all")}>All</button>
            {STATUS_KEYS.map((key) => (
              <button key={key} className="chip" data-active={statusFilter === key}
                      onClick={() => setStatusFilter(key)}>
                <span className="dot" style={{ background: STATUS[key].color }} />
                {STATUS[key].label}
              </button>
            ))}
          </div>
          <div className="toolbar-right">
            <input className="search" value={search} placeholder="Search by name…"
                   onChange={(e) => setSearch(e.target.value)} aria-label="Search candidates" />
            {otherClients.length > 0 && (
              <button className="btn ghost" onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>
                {selecting ? "Cancel" : "Copy to…"}
              </button>
            )}
            {rosterId && !rosterShared && (
              <button className="btn ghost" onClick={() => {
                if (!window.confirm(`Share this roster with ${clientName}? They'll be able to see it in their portal.`)) return;
                startTransition(() => { void shareRosterAction(rosterId); });
              }}>Share</button>
            )}
            {rosterId && (
              <form action={addCandidateAction.bind(null, clientId, rosterId)}>
                <button className="btn" type="submit">+ Add</button>
              </form>
            )}
          </div>
        </div>

        {selecting ? (
          <div className="toolbar" style={{ paddingTop: 14 }}>
            <span className="micro">
              {selected.size} selected — copies start with a blank status and no notes
            </span>
            <div className="toolbar-right">
              {otherClients.map((c) => (
                <button key={c.id} className="btn ghost" disabled={!selected.size}
                        onClick={() => copyTo(c.id)}>
                  Copy to {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="hint">Drag cards to reorder</div>
        )}

        <div className="grid">
          {visible.map((c) => (
            <div
              key={c.itemId}
              className="card"
              draggable={!selecting}
              data-dragging={dragId === c.itemId}
              data-drop={dropId === c.itemId && dragId !== c.itemId}
              data-dim={c.status === "passed"}
              onDragStart={() => setDragId(c.itemId)}
              onDragOver={(e) => { e.preventDefault(); setDropId(c.itemId); }}
              onDragEnd={() => { setDragId(null); setDropId(null); }}
              onDrop={(e) => { e.preventDefault(); commitDrop(c.itemId); setDragId(null); setDropId(null); }}
            >
              <div
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => selecting ? toggleSelected(c.itemId) : router.push(`/app/clients/${clientId}/${c.itemId}`)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (selecting) toggleSelected(c.itemId);
                  else router.push(`/app/clients/${clientId}/${c.itemId}`);
                }}
              >
                <div className="photo" style={{
                  ...photoStyle(c.photoUrl, c.photoFrame),
                  outline: selecting && selected.has(c.itemId) ? "2px solid var(--ink)" : undefined,
                  outlineOffset: 2,
                }}>
                  {!c.photoUrl && <EmptyPhoto label={selecting ? (selected.has(c.itemId) ? "Selected" : "Select") : "No photo"} />}
                  <span className="badge">
                    <span className="dot" style={{ background: STATUS[c.status].color }} />
                    {STATUS[c.status].label}
                  </span>
                  {c.reaction && (
                    <span className="badge reaction" title={`${clientName} said: ${REACTION[c.reaction].label}`}>
                      <span className="dot" style={{ background: REACTION[c.reaction].color }} />
                      {REACTION[c.reaction].label}
                    </span>
                  )}
                </div>
                <div className="card-name">{c.name}</div>
                <div className="card-meta">{[c.age, c.basedIn].filter(Boolean).join(" · ")}</div>
                {c.blurb && <div className="card-blurb">{c.blurb}</div>}
                {c.ig && <div className="card-ig">{c.ig}</div>}
              </div>
              {!selecting && (
                <button className="card-remove" title={`Remove ${c.name}`} onClick={(e) => {
                  e.stopPropagation();
                  if (!window.confirm(`Remove ${c.name} from ${clientName}'s roster?`)) return;
                  startTransition(() => { void removeRosterItemAction(c.itemId); });
                }}>×</button>
              )}
            </div>
          ))}

          {!visible.length && (
            <div className="empty">
              <p>{search.trim() ? "No candidates match your search." : "No candidates in this city yet."}</p>
              {rosterId && (
                <form action={addCandidateAction.bind(null, clientId, rosterId)}>
                  <button className="btn ghost" type="submit">+ Add a candidate here</button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
