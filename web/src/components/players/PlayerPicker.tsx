"use client";

import { useId, useMemo, useState } from "react";
import { usePlayerIndex } from "@/client/data";
import { fuzzyScore } from "@/lib/text";
import type { RosterPlayer } from "@/lib/types";
import { TeamBadge } from "../ui";

/** Accessible combobox for picking a current player. */
export function PlayerPicker({ onPick, exclude = [], label = "Add a player" }: { onPick: (p: RosterPlayer) => void; exclude?: string[]; label?: string }) {
  const { data } = usePlayerIndex();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const results = useMemo(() => {
    if (!q.trim()) return [];
    return (data?.players ?? [])
      .filter((p) => !exclude.includes(p.id))
      .map((p) => ({ p, s: fuzzyScore(q, p.name) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map((x) => x.p);
  }, [q, data, exclude]);
  const pick = (p: RosterPlayer) => {
    onPick(p);
    setQ("");
    setActive(0);
  };
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={results[active] ? `${id}-${results[active].id}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") setQ("");
        }}
        placeholder={`${label}…`}
        className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm"
      />
      {results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 w-full rounded-md border border-line bg-surface-2 py-1 shadow-lg">
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`${id}-${p.id}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${i === active ? "bg-surface-3" : ""}`}
            >
              <TeamBadge id={p.teamId} /> {p.name} <span className="text-xs text-faint">{p.position}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
