/** Rough ordering of availability designations, most severe first. Unknown strings sort lowest. */
export function injurySeverity(status: string): number {
  const s = status.toLowerCase();
  if (/out for season|season/.test(s)) return 5;
  if (/^out|suspen/.test(s)) return 4;
  if (/doubtful/.test(s)) return 3;
  if (/questionable|game.?time/.test(s)) return 2;
  if (/day.to.day|probable/.test(s)) return 1;
  return 0;
}
