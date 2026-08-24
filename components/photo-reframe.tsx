"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoFrame } from "@/lib/types";

/**
 * Reposition and zoom without re-cropping the file. Zoom goes below 100% on
 * purpose: a tall phone photo should be able to shrink to fit inside the 3:4
 * frame rather than only ever being cropped into it.
 */
export function PhotoReframe({ url, frame, onCommit }: {
  url: string;
  frame: PhotoFrame;
  onCommit: (frame: PhotoFrame) => void;
}) {
  const [local, setLocal] = useState<PhotoFrame>(frame);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const committed = useRef(false);

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(local);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") commit(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div
      role="dialog"
      aria-label="Reframe photo"
      onClick={(e) => { if (e.target === e.currentTarget) commit(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(27,26,23,0.62)", zIndex: 100,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 18,
      }}
    >
      <div className="micro" style={{ color: "var(--cream)" }}>
        Drag to reposition · scroll or use the slider to zoom
      </div>
      <div
        ref={box}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, fx: local.x, fy: local.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const rect = box.current?.getBoundingClientRect();
          if (!d || !rect) return;
          setLocal((f) => ({
            ...f,
            x: clamp(d.fx - ((e.clientX - d.x) / rect.width) * 100),
            y: clamp(d.fy - ((e.clientY - d.y) / rect.height) * 100),
          }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onWheel={(e) => {
          setLocal((f) => ({ ...f, zoom: Math.min(3, Math.max(0.4, f.zoom - e.deltaY * 0.001)) }));
        }}
        style={{
          width: "min(360px, 82vw)", aspectRatio: "3 / 4",
          backgroundColor: "var(--panel)", backgroundRepeat: "no-repeat",
          backgroundImage: `url(${url})`,
          backgroundSize: `${local.zoom * 100}%`,
          backgroundPosition: `${local.x}% ${local.y}%`,
          border: "1px solid rgba(255,255,255,0.3)", cursor: "grab", touchAction: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: "min(360px, 82vw)" }}>
        <input type="range" min={40} max={300} value={Math.round(local.zoom * 100)}
               aria-label="Zoom"
               onChange={(e) => setLocal((f) => ({ ...f, zoom: Number(e.target.value) / 100 }))}
               style={{ flex: 1 }} />
        <button className="btn" onClick={commit}>Done</button>
      </div>
    </div>
  );
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
