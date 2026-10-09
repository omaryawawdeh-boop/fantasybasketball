/*
 * Fantasy points from per-game stat lines.
 *
 * Stat ids follow ESPN's fantasy basketball stat ids so that a league's own
 * scoring settings (settings.scoringSettings.scoringItems) can be applied
 * directly. Users without ESPN data pick a preset or edit weights.
 */
(function (root) {
  const HDA = (root.HDA = root.HDA || {});

  // ESPN fantasy basketball stat ids (subset relevant to scoring).
  const STAT = {
    PTS: 0, BLK: 1, STL: 2, AST: 3, OREB: 4, DREB: 5, REB: 6, TO: 11,
    FGM: 13, FGA: 14, FTM: 15, FTA: 16, '3PM': 17, '3PA': 18, DD: 37, TD: 38, MIN: 40, GP: 42,
  };
  const STAT_LABEL = Object.fromEntries(Object.entries(STAT).map(([k, v]) => [v, k]));

  // Scoring presets. omar_league mirrors the user's league; the rest are platform defaults.
  const PRESETS = {
    omar_league: { label: 'My league (14-team ESPN H2H points)', weights: { FGM: 2, FTM: 1, '3PM': 1, REB: 1, AST: 1, STL: 3, BLK: 3, TO: -1, DD: 3, TD: 5 } },
    espn_points: { label: 'ESPN default points', weights: { PTS: 1, '3PM': 1, FGA: -1, FGM: 2, FTA: -1, FTM: 1, REB: 1, AST: 2, STL: 4, BLK: 4, TO: -2 } },
    yahoo_points: { label: 'Yahoo default points', weights: { PTS: 1, REB: 1.2, AST: 1.5, STL: 3, BLK: 3, TO: -1 } },
    sleeper_points: { label: 'Sleeper default points', weights: { PTS: 0.5, REB: 1, AST: 1, STL: 2, BLK: 2, TO: -1, '3PM': 0.5 } },
  };

  /** Convert {statKey: points} weights into ESPN-style scoring items. */
  function weightsToItems(weights) {
    return Object.entries(weights || {})
      .filter(([k, v]) => STAT[k] != null && Number(v) !== 0 && !isNaN(Number(v)))
      .map(([k, v]) => ({ statId: STAT[k], points: Number(v) }));
  }

  /**
   * @param {Record<string|number, number>} statLine per-game averages keyed by ESPN stat id
   * @param {Array<{statId:number, points:number}>} items
   * @returns {number|null} fantasy points, or null when no scorable stats exist
   */
  function fantasyPoints(statLine, items) {
    if (!statLine || !items || !items.length) return null;
    let total = 0;
    let used = 0;
    for (const { statId, points } of items) {
      let v = statLine[statId];
      // Derive REB from OREB + DREB when only the split is present.
      if (v == null && statId === STAT.REB && statLine[STAT.OREB] != null && statLine[STAT.DREB] != null) {
        v = statLine[STAT.OREB] + statLine[STAT.DREB];
      }
      if (v == null || isNaN(Number(v))) continue;
      total += Number(v) * points;
      used++;
    }
    return used ? Math.round(total * 10) / 10 : null;
  }

  Object.assign(HDA, { STAT, STAT_LABEL, SCORING_PRESETS: PRESETS, weightsToItems, fantasyPoints });
  if (typeof module !== 'undefined' && module.exports) module.exports = HDA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
