"use client";

import { AiChat } from "@/components/ai/AiChat";
import { SectionHeader } from "@/components/ui";

export default function AiPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader as="h1" title="AI analyst" />
      <p className="-mt-2 mb-4 text-sm text-muted">
        Grounded in this app&apos;s data: before answering, it retrieves matching stories, injuries, scores and stats and must cite them. It can&apos;t browse the web,
        so anything outside that data gets &quot;not available&quot;. Questions are sent to the AI provider you configured (see Settings).
      </p>
      <div className="rounded-lg border border-line bg-surface p-4">
        <AiChat />
      </div>
    </div>
  );
}
