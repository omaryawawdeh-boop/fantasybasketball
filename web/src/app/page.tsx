"use client";

import { FeedView } from "@/components/feed/FeedView";
import { ScoreStrip } from "@/components/games/ScoreStrip";

export default function HomePage() {
  return (
    <div>
      <h1 className="sr-only">Home — what matters in the NBA right now</h1>
      <ScoreStrip />
      <FeedView featureTop />
    </div>
  );
}
