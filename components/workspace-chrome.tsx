"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Brand } from "@/lib/types";
import { Wordmark } from "@/components/brand";
import { createClientAction, renameClientAction, deleteClientAction } from "@/lib/actions";

interface ClientSummary { id: string; name: string; count: number }

const NAV = [
  { href: "/app", label: "Roster", match: (p: string) => p === "/app" || p.startsWith("/app/clients") },
  { href: "/app/schedule", label: "Schedule", match: (p: string) => p.startsWith("/app/schedule") },
  { href: "/app/network", label: "Network", match: (p: string) => p.startsWith("/app/network") },
  { href: "/app/billing", label: "Billing", match: (p: string) => p.startsWith("/app/billing") },
  { href: "/app/settings", label: "Settings", match: (p: string) => p.startsWith("/app/settings") },
] as const;

export function WorkspaceChrome({
  brand, agencyName, clients, demoMode, viewerName, canSignOut, children,
}: {
  brand: Brand;
  agencyName: string;
  clients: ClientSummary[];
  demoMode: boolean;
  viewerName?: string;
  canSignOut?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();

  const currentId = pathname.match(/\/app\/clients\/([^/]+)/)?.[1];
  const current = clients.find((c) => c.id === currentId) ?? clients[0];

  function withPrompt(message: string, initial: string, run: (value: string) => Promise<unknown>) {
    const value = window.prompt(message, initial);
    setMenuOpen(false);
    if (!value?.trim()) return;
    startTransition(() => { void run(value.trim()); });
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <div className="topbar-col">
            {current ? (
              <div className="switcher">
                <span className="switcher-label">Client</span>
                <button className="switcher-btn" onClick={() => setMenuOpen((v) => !v)}
                        aria-expanded={menuOpen} aria-haspopup="menu">
                  <span className="switcher-name">{current.name}</span>
                  <span className="switcher-caret" aria-hidden>▾</span>
                </button>
                {menuOpen && (
                  <>
                    <button className="click-catcher" aria-label="Close menu"
                            onClick={() => setMenuOpen(false)} />
                    <div className="menu" role="menu">
                      {clients.map((c) => (
                        <Link key={c.id} href={`/app/clients/${c.id}`} className="menu-item"
                              data-active={c.id === current.id} onClick={() => setMenuOpen(false)}>
                          <span>{c.name}</span>
                          <span className="count">{c.count}</span>
                        </Link>
                      ))}
                      <div className="menu-divider" />
                      <button className="menu-action"
                              onClick={() => withPrompt("New client's name?", "", createClientAction)}>
                        + New client
                      </button>
                      <button className="menu-action"
                              onClick={() => withPrompt("Rename client:", current.name,
                                (v) => renameClientAction(current.id, v))}>
                        Rename current
                      </button>
                      <button className="menu-action danger" onClick={() => {
                        setMenuOpen(false);
                        if (clients.length <= 1) { window.alert("You need at least one client."); return; }
                        if (!window.confirm(`Delete ${current.name} and their entire roster? This cannot be undone.`)) return;
                        startTransition(() => { void deleteClientAction(current.id); });
                      }}>
                        Delete current
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="eyebrow">{agencyName}</span>
            )}
          </div>

          <div className="topbar-col center">
            <Link href="/app"><Wordmark brand={brand} /></Link>
          </div>

          <div className="topbar-col right">
            <nav className="nav">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} data-active={item.match(pathname)}>
                  {item.label}
                </Link>
              ))}
            </nav>
            {current && (
              <button className="btn ghost" onClick={() => router.push(`/portal/${current.id}`)}>
                Client view
              </button>
            )}
            {canSignOut && (
              <a className="micro" href="/auth/signout" title={`Signed in as ${viewerName ?? ""}`}
                 style={{ letterSpacing: "0.1em" }}>
                Sign out
              </a>
            )}
          </div>
        </div>
      </header>

      {demoMode && (
        <div style={{
          textAlign: "center", padding: "8px 20px", fontSize: 10.5, letterSpacing: "0.16em",
          textTransform: "uppercase", color: "var(--text-muted)",
          borderBottom: "1px solid var(--hair-10)",
        }}>
          Demo data · add Supabase keys to run against the real database
        </div>
      )}

      {children}
    </>
  );
}
