"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { City, PortalRosterItem } from "@/lib/types";
import { REACTION, STATUS } from "@/lib/types";
import { photoStyle, EmptyPhoto } from "@/components/photo";

export function PortalRoster({ clientId, clientName, cities, items }: {
  clientId: string;
  clientName: string;
  cities: City[];
  items: PortalRosterItem[];
}) {
  const router = useRouter();
  const [city, setCity] = useState("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (city === "all" || i.cityId === city) &&
      (!q || i.candidate.name.toLowerCase().includes(q)));
  }, [items, city, search]);

  const decided = items.filter((i) => i.feedback.reaction).length;
  const countFor = (key: string) =>
    key === "all" ? items.length : items.filter((i) => i.cityId === key).length;

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Selected for {clientName}</h1>
        <div className="page-sub">
          Curated selection · Confidential
          {decided > 0 && ` · ${decided} of ${items.length} answered`}
        </div>
      </div>

      <div className="city-bar">
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
      </div>

      <div className="main">
        <div className="toolbar">
          <span className="micro">Tap a profile to read more and tell us what you think</span>
          <div className="toolbar-right">
            <input className="search" value={search} placeholder="Search by name…"
                   onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
          </div>
        </div>

        <div className="grid">
          {visible.map((i) => (
            <div key={i.id} className="card" data-dim={i.status === "passed"}
                 role="button" tabIndex={0} style={{ cursor: "pointer" }}
                 onClick={() => router.push(`/portal/${clientId}/${i.id}`)}
                 onKeyDown={(e) => {
                   if (e.key === "Enter" || e.key === " ") {
                     e.preventDefault();
                     router.push(`/portal/${clientId}/${i.id}`);
                   }
                 }}>
              <div className="photo" style={photoStyle(i.candidate.photoUrl, i.candidate.photoFrame)}>
                {!i.candidate.photoUrl && <EmptyPhoto />}
                <span className="badge">
                  <span className="dot" style={{ background: STATUS[i.status].color }} />
                  {STATUS[i.status].label}
                </span>
                {i.feedback.reaction && (
                  <span className="badge reaction">
                    <span className="dot" style={{ background: REACTION[i.feedback.reaction].color }} />
                    {REACTION[i.feedback.reaction].label}
                  </span>
                )}
              </div>
              <div className="card-name">{i.candidate.name}</div>
              <div className="card-meta">
                {[i.candidate.age, i.candidate.basedIn].filter(Boolean).join(" · ")}
              </div>
              {i.blurb && <div className="card-blurb">{i.blurb}</div>}
            </div>
          ))}

          {!visible.length && (
            <div className="empty">
              <p>Nothing here just yet — your matchmaker is still putting this together.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
