"use client";

import Link from "next/link";
import { useStandings } from "@/client/data";
import { DataStatus, ErrorState, SectionHeader, Skeleton, TeamBadge } from "../ui";

export function StandingsTables({ highlight }: { highlight?: string }) {
  const { data, meta, error, isLoading } = useStandings();
  if (isLoading) return <Skeleton className="h-64" />;
  if (error) return <ErrorState error={error} what="standings" />;
  const rows = data?.standings;
  return (
    <section>
      <SectionHeader title="Standings" right={<DataStatus meta={meta} />} />
      {!rows ? (
        <p className="text-sm text-muted">Standings source unavailable.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["East", "West"] as const).map((conf) => (
            <div key={conf} className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-sm">
                <caption className="px-3 py-2 text-left text-xs font-semibold text-muted">{conf}ern Conference</caption>
                <thead className="text-[11px] uppercase text-faint">
                  <tr className="border-t border-line">
                    <th scope="col" className="px-3 py-1.5 text-left">Team</th>
                    <th scope="col" className="px-2 text-right">W</th>
                    <th scope="col" className="px-2 text-right">L</th>
                    <th scope="col" className="px-2 text-right">PCT</th>
                    <th scope="col" className="px-2 text-right">GB</th>
                    <th scope="col" className="px-3 text-right">STRK</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter((r) => r.conference === conf)
                    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99) || (b.pct ?? 0) - (a.pct ?? 0))
                    .map((r, i) => (
                      <tr key={r.team.id} className={`border-t border-line ${highlight === r.team.id ? "bg-accent-soft" : ""}`}>
                        <td className="px-3 py-1.5">
                          <Link href={`/teams/${r.team.id}`} className="flex items-center gap-2 hover:underline">
                            <span className="tabular w-4 text-faint">{r.seed ?? i + 1}</span>
                            <TeamBadge id={r.team.id} /> {r.team.name}
                          </Link>
                        </td>
                        <td className="tabular px-2 text-right">{r.wins}</td>
                        <td className="tabular px-2 text-right">{r.losses}</td>
                        <td className="tabular px-2 text-right">{r.pct != null ? r.pct.toFixed(3).replace(/^0/, "") : "—"}</td>
                        <td className="tabular px-2 text-right">{r.gb ?? "—"}</td>
                        <td className="tabular px-3 text-right">{r.streak ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
