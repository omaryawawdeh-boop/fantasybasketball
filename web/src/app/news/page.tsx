"use client";

import { FeedView } from "@/components/feed/FeedView";
import { SectionHeader } from "@/components/ui";

export default function NewsPage() {
  return (
    <div>
      <SectionHeader as="h1" title="Latest NBA news" />
      <FeedView initial={{ sort: "latest" }} />
    </div>
  );
}
