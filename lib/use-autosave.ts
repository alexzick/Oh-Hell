"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved";

/**
 * Text fields save as you type rather than behind a Save button, because the
 * tool this replaces had no save step and the matchmaker's habit is to type a
 * note and close the tab. Debounced so a paragraph is one write, not forty.
 */
export function useAutosave(delay = 500) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef(0);

  useEffect(() => {
    const map = timers.current;
    return () => { for (const t of map.values()) clearTimeout(t); };
  }, []);

  const save = useCallback((key: string, run: () => Promise<unknown>) => {
    const existing = timers.current.get(key);
    if (existing) clearTimeout(existing);
    setState("saving");
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key);
      pending.current += 1;
      void run().finally(() => {
        pending.current -= 1;
        if (pending.current === 0) {
          setState("saved");
          setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 1600);
        }
      });
    }, delay));
  }, [delay]);

  return { save, state };
}
