/**
 * Team-level analytics for the Owners Portal Team page.
 * Grouped by pitcher team from settled GameRow history.
 */

/** @typedef {import("../data/games.js").GameRow} GameRow */
/** @typedef {{ wins: number, losses: number, total: number, winRate: number }} WinLoss */
/** @typedef {{ id: string, label: string, tone: string, stats: WinLoss }} StrategyStat */
/** @typedef {{ title: string, body: string, impact: "positive"|"negative"|"neutral", score: number }} TeamNote */

/** @param {number} wins @param {number} losses @returns {WinLoss} */
function wl(wins, losses) {
  const total = wins + losses;
  return { wins, losses, total, winRate: total ? wins / total : 0 };
}

/** @param {boolean[]} flags */
function wlFromFlags(flags) {
  let wins = 0;
  let losses = 0;
  for (const flag of flags) {
    if (flag) wins += 1;
    else losses += 1;
  }
  return wl(wins, losses);
}

/** @param {string} value */
function isYes(value) {
  const v = String(value || "").toLowerCase();
  return v === "yes" || v === "win";
}

/** @param {string} value */
function isNo(value) {
  const v = String(value || "").toLowerCase();
  return v === "no" || v === "loss";
}

/** @param {GameRow[]} games @param {"DK"|"FD"} book */
function ouWinLoss(games, book) {
  let wins = 0;
  let losses = 0;
  for (const game of games) {
    const correct = book === "DK" ? game.dkCorrect : game.fdCorrect;
    if (isYes(correct)) wins += 1;
    else if (isNo(correct)) losses += 1;
  }
  return wl(wins, losses);
}

/** @param {GameRow[]} games @param {number} offset */
function ekWinLoss(games, offset = 0) {
  const flags = [];
  for (const game of games) {
    if (game.ensemble == null || game.actual == null) continue;
    flags.push(game.actual >= Math.floor(game.ensemble) - offset);
  }
  return wlFromFlags(flags);
}

/** @param {GameRow[]} games */
function avg(games, key) {
  let sum = 0;
  let n = 0;
  for (const g of games) {
    const v = g[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/** @param {GameRow[]} games */
function modelError(games) {
  let abs = 0;
  let signed = 0;
  let n = 0;
  for (const g of games) {
    if (g.ensemble == null || g.actual == null) continue;
    const err = g.ensemble - g.actual;
    abs += Math.abs(err);
    signed += err;
    n += 1;
  }
  return {
    mae: n ? abs / n : null,
    bias: n ? signed / n : null,
    sample: n,
  };
}

/**
 * @param {GameRow[]} games
 * @param {(g: GameRow) => string} keyFn
 * @param {number} [minSample]
 */
function groupBy(games, keyFn, minSample = 1) {
  /** @type {Map<string, GameRow[]>} */
  const map = new Map();
  for (const g of games) {
    const key = keyFn(g);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  return [...map.entries()]
    .map(([label, rows]) => ({ label, rows, games: rows.length }))
    .filter((r) => r.games >= minSample);
}

/** @param {string} value */
function normalizeSide(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v.startsWith("h")) return "Home";
  if (v.startsWith("a")) return "Away";
  return String(value || "").trim() || "Unknown";
}

/**
 * @param {GameRow[]} games
 * @param {string} team
 * @param {number | null} leagueAvgK
 * @returns {TeamNote[]}
 */
function buildTeamNotes(games, team, leagueAvgK) {
  /** @type {TeamNote[]} */
  const notes = [];
  if (!games.length) return notes;
  const baselineK = avg(games, "actual");
  const dk = ouWinLoss(games, "DK");
  const fd = ouWinLoss(games, "FD");
  const ek0 = ekWinLoss(games, 0);
  const ek1 = ekWinLoss(games, 1);

  /** @type {StrategyStat[]} */
  const strategies = [
    { id: "dk", label: "DK O/U", tone: "book-dk", stats: dk },
    { id: "fd", label: "FD O/U", tone: "book-fd", stats: fd },
    { id: "ek0", label: "EK0", tone: "book-ek0", stats: ek0 },
    { id: "ek1", label: "EK-1", tone: "book-ek1", stats: ek1 },
  ].filter((s) => s.stats.total >= 2);

  if (baselineK != null) {
    notes.push({
      title: "Staff K profile",
      body: `${team} starters are averaging ${baselineK.toFixed(1)} actual Ks across ${games.length} settled start${games.length === 1 ? "" : "s"} in range.`,
      impact: "neutral",
      score: 0.35,
    });
  }

  if (baselineK != null && leagueAvgK != null && Math.abs(baselineK - leagueAvgK) >= 0.25) {
    const higher = baselineK > leagueAvgK;
    notes.push({
      title: higher ? "High-K staff" : "Low-K staff",
      body: `${team} has been a ${higher ? "higher" : "lower"} K staff (${baselineK.toFixed(1)} avg vs ${leagueAvgK.toFixed(1)} overall, ${higher ? "+" : ""}${(baselineK - leagueAvgK).toFixed(1)}).`,
      impact: higher ? "positive" : "negative",
      score: Math.abs(baselineK - leagueAvgK) + games.length / 50,
    });
  }

  if (strategies.length) {
    const ranked = [...strategies].sort(
      (a, b) => b.stats.winRate - a.stats.winRate || b.stats.total - a.stats.total
    );
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.stats.total >= 3) {
      notes.push({
        title: "Best strategy",
        body: `${team} has been strongest on ${best.label} at ${(best.stats.winRate * 100).toFixed(0)}% (${best.stats.wins}W–${best.stats.losses}L).`,
        impact: "positive",
        score: best.stats.winRate + best.stats.total / 100,
      });
    }
    if (worst !== best && worst.stats.total >= 3 && worst.stats.winRate + 0.08 <= best.stats.winRate) {
      notes.push({
        title: "Softest strategy",
        body: `${team} has struggled most on ${worst.label} at ${(worst.stats.winRate * 100).toFixed(0)}% (${worst.stats.wins}W–${worst.stats.losses}L).`,
        impact: "negative",
        score: 1 - worst.stats.winRate + worst.stats.total / 100,
      });
    }
  }

  const pitchers = groupBy(games, (g) => String(g.pitcher || "").trim(), 2)
    .map((row) => ({
      ...row,
      avgK: avg(row.rows, "actual"),
      ek1: ekWinLoss(row.rows, 1),
    }))
    .filter((row) => row.ek1.total >= 2)
    .sort((a, b) => b.ek1.winRate - a.ek1.winRate || b.ek1.total - a.ek1.total);

  if (pitchers.length) {
    const best = pitchers[0];
    notes.push({
      title: "Staff leader",
      body: `${best.label} leads ${team} on EK-1 at ${(best.ek1.winRate * 100).toFixed(0)}% (${best.ek1.wins}W–${best.ek1.losses}L) across ${best.games} starts.`,
      impact: "positive",
      score: best.ek1.winRate + best.games / 20,
    });
    const soft = [...pitchers].sort(
      (a, b) => a.ek1.winRate - b.ek1.winRate || b.ek1.total - a.ek1.total
    )[0];
    if (soft && soft.label !== best.label && soft.ek1.winRate + 0.1 <= best.ek1.winRate) {
      notes.push({
        title: "Staff caution",
        body: `${soft.label} has been ${team}'s softest EK-1 mark at ${(soft.ek1.winRate * 100).toFixed(0)}% (${soft.ek1.wins}W–${soft.ek1.losses}L).`,
        impact: "negative",
        score: 1 - soft.ek1.winRate + soft.games / 20,
      });
    }
  }

  if (baselineK != null) {
    const opponents = groupBy(games, (g) => String(g.opponent || "").trim(), 2)
      .map((row) => {
        const k = avg(row.rows, "actual");
        return { ...row, avgK: k, delta: k == null ? 0 : k - baselineK };
      })
      .filter((row) => row.avgK != null && Math.abs(row.delta) >= 0.5)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    if (opponents[0]) {
      const opp = opponents[0];
      const better = opp.delta > 0;
      notes.push({
        title: "Vs opponent",
        body: `${team} starters have performed ${better ? "better" : "worse"} against ${opp.label}, averaging ${opp.avgK.toFixed(1)} Ks across ${opp.games} starts (${better ? "+" : ""}${opp.delta.toFixed(1)} vs staff mark).`,
        impact: better ? "positive" : "negative",
        score: Math.abs(opp.delta) + opp.games / 10,
      });
    }
  }

  const sides = groupBy(games, (g) => normalizeSide(g.homeAway), 3).map((row) => ({
    ...row,
    avgK: avg(row.rows, "actual"),
  }));
  if (sides.length >= 2 && baselineK != null) {
    const ranked = [...sides]
      .filter((s) => s.avgK != null)
      .sort((a, b) => Math.abs((b.avgK || 0) - baselineK) - Math.abs((a.avgK || 0) - baselineK));
    const top = ranked[0];
    if (top && Math.abs((top.avgK || 0) - baselineK) >= 0.3) {
      const better = (top.avgK || 0) > baselineK;
      notes.push({
        title: "Home/Away split",
        body: `${team} has been ${better ? "better" : "worse"} in ${top.label.toLowerCase()} starts (${(top.avgK || 0).toFixed(1)} avg Ks, n=${top.games}).`,
        impact: better ? "positive" : "negative",
        score: Math.abs((top.avgK || 0) - baselineK),
      });
    }
  }

  const err = modelError(games);
  if (err.mae != null && err.sample >= 3) {
    if (err.mae <= 1.25) {
      notes.push({
        title: "Projection fit",
        body: `PitchIQ has tracked ${team} tightly — MAE ${err.mae.toFixed(2)} Ks (n=${err.sample}).`,
        impact: "positive",
        score: 2 - err.mae,
      });
    } else if (err.mae >= 1.65) {
      notes.push({
        title: "Projection noise",
        body: `${team} has been harder to pin — PitchIQ MAE ${err.mae.toFixed(2)} Ks (n=${err.sample}).`,
        impact: "negative",
        score: err.mae / 2,
      });
    }
  }

  const seen = new Set();
  return notes
    .sort((a, b) => b.score - a.score)
    .filter((n) => {
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    })
    .slice(0, 6);
}

/** @param {GameRow[]} games */
export function teamNamesFromGames(games) {
  const names = [
    ...new Set(
      (games || [])
        .map((g) => String(g.pitcherTeam || "").trim())
        .filter(Boolean)
    ),
  ];
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}

/**
 * @param {GameRow[]} allGames
 * @param {string} teamName
 */
export function buildTeamProfile(allGames, teamName) {
  const team = String(teamName || "").trim();
  const league = (allGames || []).filter((g) => g.actual != null);
  const leagueAvgK = avg(league, "actual");
  const games = (allGames || [])
    .filter((g) => String(g.pitcherTeam || "").trim() === team)
    .slice()
    .sort((a, b) => {
      const at = a.date ? a.date.getTime() : 0;
      const bt = b.date ? b.date.getTime() : 0;
      return bt - at;
    });

  if (!games.length) return null;

  const dk = ouWinLoss(games, "DK");
  const fd = ouWinLoss(games, "FD");
  const ek0 = ekWinLoss(games, 0);
  const ek1 = ekWinLoss(games, 1);
  /** @type {StrategyStat[]} */
  const strategies = [
    { id: "dk", label: "DK O/U", tone: "book-dk", stats: dk },
    { id: "fd", label: "FD O/U", tone: "book-fd", stats: fd },
    { id: "ek0", label: "EK0", tone: "book-ek0", stats: ek0 },
    { id: "ek1", label: "EK-1", tone: "book-ek1", stats: ek1 },
  ];
  const ranked = [...strategies]
    .filter((s) => s.stats.total > 0)
    .sort((a, b) => b.stats.winRate - a.stats.winRate || b.stats.total - a.stats.total);

  const baselineK = avg(games, "actual");
  const err = modelError(games);
  const dated = games.filter((g) => g.date);

  const pitchers = groupBy(games, (g) => String(g.pitcher || "").trim(), 1)
    .map((row) => {
      const avgK = avg(row.rows, "actual");
      return {
        pitcher: row.label,
        games: row.games,
        avgK,
        dk: ouWinLoss(row.rows, "DK"),
        fd: ouWinLoss(row.rows, "FD"),
        ek0: ekWinLoss(row.rows, 0),
        ek1: ekWinLoss(row.rows, 1),
      };
    })
    .sort((a, b) => b.games - a.games || String(a.pitcher).localeCompare(String(b.pitcher)));

  const homeAway = groupBy(games, (g) => normalizeSide(g.homeAway), 1).map((row) => ({
    side: row.label,
    games: row.games,
    avgK: avg(row.rows, "actual"),
    dk: ouWinLoss(row.rows, "DK"),
    ek1: ekWinLoss(row.rows, 1),
  }));

  const opponents = groupBy(games, (g) => String(g.opponent || "").trim(), 1)
    .map((row) => {
      const avgK = avg(row.rows, "actual");
      return {
        opponent: row.label,
        games: row.games,
        avgK,
        delta: baselineK != null && avgK != null ? avgK - baselineK : null,
        dk: ouWinLoss(row.rows, "DK"),
        ek1: ekWinLoss(row.rows, 1),
      };
    })
    .sort((a, b) => b.games - a.games || String(a.opponent).localeCompare(String(b.opponent)));

  return {
    team,
    starts: games.length,
    pitcherCount: pitchers.length,
    dateStart: dated.length ? dated[dated.length - 1].date : null,
    dateEnd: dated.length ? dated[0].date : null,
    avgActual: baselineK,
    leagueAvgK,
    avgDelta: baselineK != null && leagueAvgK != null ? baselineK - leagueAvgK : null,
    avgEnsemble: avg(games, "ensemble"),
    avgDkLine: avg(games, "dkLine"),
    avgFdLine: avg(games, "fdLine"),
    mae: err.mae,
    bias: err.bias,
    strategies,
    bestStrategy: ranked[0] || null,
    pitchers,
    homeAway,
    opponents,
    notes: buildTeamNotes(games, team, leagueAvgK),
    recent: games.slice(0, 8),
  };
}
