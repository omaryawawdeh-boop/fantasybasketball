"use client";

import Link from "next/link";
import { useStandings } from "@/client/data";
import { toggleTeam, usePrefs } from "@/client/state";
import { TEAMS } from "@/lib/teams";
import { Icon } from "@/components/icons";
import { cx, SectionHeader, TeamBadge } from "@/components/ui";

export default function TeamsPage() {
  const prefs = usePrefs();
  const { data } = useStandings();
  return (
    <div>
      <SectionHeader as="h1" title="Teams" />
      {(["East", "West"] as const).map((conf) => (
        <section key={conf} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{conf}ern Conference</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TEAMS.filter((t) => t.conference === conf).map((t) => {
              const row = data?.standings?.find((r) => r.team.id === t.id);
              const following = prefs.followedTeams.includes(t.id);
              return (
                <li key={t.id} className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                  <Link href={`/teams/${t.id}`} className="flex items-center gap-2 hover:underline">
                    <TeamBadge id={t.id} size="md" />
                    <span>
                      <span className="block text-sm font-medium">{t.name}</span>
                      {row && <span className="text-xs text-faint">{row.wins}-{row.losses}</span>}
                    </span>
                  </Link>
                  <button
                    onClick={() => toggleTeam(t.id)}
                    aria-pressed={following}
                    aria-label={`${following ? "Unfollow" : "Follow"} ${t.name}`}
                    className={cx("rounded p-1.5", following ? "text-accent" : "text-faint hover:text-text")}
                  >
                    <Icon name="star" size={16} fill={following ? "currentColor" : "none"} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
