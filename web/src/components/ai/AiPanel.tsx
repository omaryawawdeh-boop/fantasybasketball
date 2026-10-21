"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "../icons";
import { AiChat } from "./AiChat";

/** Side panel version of the analyst. Non-modal on desktop so the page stays usable beside it. */
export function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <aside
      ref={ref}
      aria-label="AI analyst"
      className="fixed inset-x-0 bottom-0 top-14 z-40 flex flex-col border-l border-line bg-surface p-4 shadow-2xl sm:left-auto sm:w-[420px]"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="sparkles" /> AI analyst
        </h2>
        <div className="flex items-center gap-1">
          <Link href="/ai" onClick={onClose} className="rounded px-2 py-1 text-xs text-muted hover:text-text">
            Full page
          </Link>
          <button onClick={onClose} aria-label="Close AI analyst" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text">
            <Icon name="x" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <AiChat compact />
      </div>
    </aside>
  );
}
