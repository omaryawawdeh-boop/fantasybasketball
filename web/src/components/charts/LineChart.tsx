"use client";

// Lightweight SVG line chart (no chart library). Accessible: summarized in aria-label, and the
// underlying numbers are available in a visually hidden table.

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
}

export function LineChart({ labels, series, height = 160, title }: { labels: string[]; series: Series[]; height?: number; title: string }) {
  const W = 600;
  const H = height;
  const pad = { l: 32, r: 8, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!all.length || labels.length < 2) return <p className="text-sm text-muted">Not enough games to chart.</p>;
  const max = Math.max(...all) * 1.1 || 1;
  const min = Math.min(0, ...all);
  const x = (i: number) => pad.l + (i / (labels.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [min, (min + max) / 2, max].map((v) => Math.round(v));
  const summary = series.map((s) => {
    const vals = s.values.filter((v): v is number => v != null);
    return `${s.name}: from ${vals[0]} to ${vals[vals.length - 1]}, high ${Math.max(...vals)}`;
  });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}. ${summary.join("; ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--faint)">
              {t}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 || i === labels.length - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--faint)">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
          return (
            <g key={s.name}>
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {s.values.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color }} aria-hidden /> {s.name}
          </span>
        ))}
      </figcaption>
      <div className="sr-only">
      <table>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Game</th>
            {series.map((s) => (
              <th key={s.name}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            <tr key={i}>
              <td>{l}</td>
              {series.map((s) => (
                <td key={s.name}>{s.values[i] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

/** Distinguishable series colors that work on dark and light backgrounds. */
export const SERIES_COLORS = ["#e8833a", "#5b9cf0", "#3fb67b", "#c678dd"];
