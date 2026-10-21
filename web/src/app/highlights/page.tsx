"use client";

import { FeedView } from "@/components/feed/FeedView";
import { SectionHeader } from "@/components/ui";

export default function HighlightsPage() {
  return (
    <div>
      <SectionHeader as="h1" title="Highlights & video" />
      <p className="-mt-2 mb-4 text-sm text-muted">
        Videos play in the app when the source allows embedding (YouTube). Other video links say where they will open.
      </p>
      <FeedView initial={{ types: ["highlight", "interview"], sort: "latest" }} lockTypes grid emptyText="No videos match. Video sources may be unreachable — see Settings → Data sources." />
    </div>
  );
}
