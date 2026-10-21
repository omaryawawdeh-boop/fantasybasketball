"use client";

import { useEffect } from "react";
import { useInjuries } from "@/client/data";
import { injuryHistoryStore } from "@/client/state";

/**
 * Records each injury status this browser sees, so the tracker can show how a designation
 * changed (Questionable → Out) without a server database. History only covers times the app
 * was open; it never invents intermediate statuses.
 */
export function InjuryHistoryRecorder() {
  const { data, meta } = useInjuries();
  useEffect(() => {
    if (!data?.injuries) return;
    // Demo statuses are fictional; don't mix them into real history.
    if (meta.some((m) => m.mode === "demo")) return;
    const now = new Date().toISOString();
    injuryHistoryStore.set((hist) => {
      let changed = false;
      const next = { ...hist };
      for (const e of data.injuries!) {
        const key = e.playerId ?? `${e.teamId}:${e.playerName}`;
        const list = next[key] ?? [];
        const last = list[list.length - 1];
        if (!last || last.status !== e.status) {
          next[key] = [...list, { status: e.status, reportedAt: e.reportedAt, firstSeen: now, detail: e.detail }].slice(-20);
          changed = true;
        }
      }
      return changed ? next : hist;
    });
  }, [data, meta]);
  return null;
}
