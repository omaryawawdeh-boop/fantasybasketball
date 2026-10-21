"use client";

import Link from "next/link";
import { FeedView } from "@/components/feed/FeedView";
import { SectionHeader } from "@/components/ui";

export default function HistoryPage() {
  return (
    <div>
      <SectionHeader as="h1" title="Historical NBA content" />
      <div className="mb-4 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
        <p>
          Stories about records, anniversaries, legends and classic games from the feed. For historical numbers, open any player profile for season-by-season
          career averages, or use <Link href="/stats" className="underline">Stats &amp; compare</Link> with a past season.
        </p>
        <p className="mt-2">
          Not available yet: all-time leaderboards and historical team records. No free source with permission to reuse that data was found for this prototype
          (see README → Limitations).
        </p>
      </div>
      <FeedView initial={{ types: ["history"] }} lockTypes emptyText="No historical stories in the current feed window." />
    </div>
  );
}
