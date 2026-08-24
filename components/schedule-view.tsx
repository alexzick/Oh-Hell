"use client";

import { useState, useTransition } from "react";
import type { Booking, BookingType } from "@/lib/types";
import { createBookingAction, updateBookingAction } from "@/lib/actions";

interface Row extends Booking {
  clientLabel: string;
  candidateLabel: string | null;
  typeLabel: string;
}

const STATUS_COLOR: Record<Booking["status"], string> = {
  proposed: "var(--status-maybe)",
  confirmed: "var(--status-yes)",
  declined: "var(--status-passed)",
  completed: "var(--text-muted)",
  cancelled: "var(--status-passed)",
};

export function ScheduleView({ agencyId, bookingTypes, clients, members, bookings }: {
  agencyId: string;
  bookingTypes: BookingType[];
  clients: { id: string; name: string }[];
  members: { id: string; name: string }[];
  bookings: Row[];
}) {
  const [, startTransition] = useTransition();
  const [typeId, setTypeId] = useState(bookingTypes[0]?.id ?? "");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [when, setWhen] = useState("");

  const now = Date.now();
  const upcoming = bookings.filter((b) => Date.parse(b.startsAt) >= now);
  const past = bookings.filter((b) => Date.parse(b.startsAt) < now);

  function create() {
    const type = bookingTypes.find((t) => t.id === typeId);
    if (!type || !when) return;
    const startsAt = new Date(when);
    const endsAt = new Date(startsAt.getTime() + type.durationMin * 60_000);
    startTransition(() => {
      void createBookingAction({
        agencyId, bookingTypeId: type.id, clientId: clientId || null,
        candidateId: null, memberId: members[0]?.id ?? null, rosterItemId: null,
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
        status: "proposed", location: "", notes: "",
      });
      setWhen("");
    });
  }

  return (
    <div className="main">
      <div className="page-head" style={{ textAlign: "left", padding: "26px 0 24px" }}>
        <h1 className="page-title">Schedule</h1>
        <div className="page-sub" style={{ letterSpacing: "0.18em" }}>
          Intakes, introductions and check-ins
        </div>
      </div>

      <section className="tile" style={{ marginBottom: 34 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Propose a time</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 200 }}>
            <label className="field-label" htmlFor="bt">Type</label>
            <select id="bt" className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              {bookingTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {t.durationMin} min</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="field-label" htmlFor="bc">Client</label>
            <select id="bc" className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label className="field-label" htmlFor="bw">When</label>
            <input id="bw" className="input" type="datetime-local" value={when}
                   onChange={(e) => setWhen(e.target.value)} />
          </div>
          <button className="btn" disabled={!when || !typeId} onClick={create}>Propose</button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "14px 0 0", lineHeight: 1.6 }}>
          A proposed time appears in the client&rsquo;s portal for them to confirm. Connecting a
          calendar (Settings → Calendar) turns confirmations into real invites and blocks times
          you&rsquo;re already busy.
        </p>
      </section>

      <BookingTable title="Upcoming" rows={upcoming} onSetStatus={(id, status) =>
        startTransition(() => { void updateBookingAction(id, { status }); })} />

      {past.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <BookingTable title="Past" rows={past} onSetStatus={(id, status) =>
            startTransition(() => { void updateBookingAction(id, { status }); })} />
        </div>
      )}
    </div>
  );
}

function BookingTable({ title, rows, onSetStatus }: {
  title: string;
  rows: Row[];
  onSetStatus: (id: string, status: Booking["status"]) => void;
}) {
  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: 14 }}>{title}</div>
      {rows.length === 0 ? (
        <div className="empty" style={{ padding: "50px 20px" }}>
          <p>Nothing scheduled.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr><th>When</th><th>Type</th><th>With</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td>
                  {new Date(b.startsAt).toLocaleString(undefined, {
                    weekday: "short", month: "short", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}
                </td>
                <td>{b.typeLabel}</td>
                <td>
                  {b.clientLabel}
                  {b.candidateLabel && <div className="sub">with {b.candidateLabel}</div>}
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span className="dot" style={{ background: STATUS_COLOR[b.status] }} />
                    <span style={{ fontFamily: "var(--sans)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {b.status}
                    </span>
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  {b.status === "proposed" && (
                    <button className="btn ghost" onClick={() => onSetStatus(b.id, "confirmed")}>
                      Confirm
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
