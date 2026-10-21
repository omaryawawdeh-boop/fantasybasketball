"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

/** Builds the current URL with ?story=<id>, so the reader opens over the page and Back closes it. */
export function useStoryHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (id: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("story", id);
    else p.delete("story");
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

export function StoryLink({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const href = useStoryHref();
  return (
    <Link href={href(id)} scroll={false} className={className}>
      {children}
    </Link>
  );
}
