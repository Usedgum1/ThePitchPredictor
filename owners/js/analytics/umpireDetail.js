/**
 * Umpire-level analytics for the Owners Portal Umps page.
 * Derived from settled GameRow history already loaded in-memory.
 */

/** @typedef {import("../data/games.js").GameRow} GameRow */
/** @typedef {{ wins: number, losses: number, total: number, winRate: number }} WinLoss */
/** @typedef {{ id: string, label: string, tone: string, stats: WinLoss }} StrategyStat */
/** @typedef {{ title: string, body: string, impact: "positive"|"negative"|"neutral", score: number }} UmpireNote */

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

/** @param {string} name */
function shortUmpName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[parts.length - 1] || "This umpire";
}

/**
 * @param {GameRow[]} games
 * @param {number | null} leagueAvgK
 * @returns {UmpireNote[]}
 */
function buildUmpireNotes(games, leagueAvgK) {
  /** @type {UmpireNote[]} */
  const notes = [];
  if (!games.length) return notes;
  const name = games[0].plateUmpire || "This umpire";
  const last = shortUmpName(name);
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
      title: "K environment",
      body: `${last} has averaged ${baselineK.toFixed(1)} actual Ks across ${games.length} plate appearance${games.length === 1 ? "" : "s"} in range.`,
      impact: "neutral",
      score: 0.4,
    });
  }

  if (baselineK != null && leagueAvgK != null && Math.abs(baselineK - leagueAvgK) >= 0.25) {
    const higher = baselineK > leagueAvgK;
    notes.push({
      title: higher ? "High-K lean" : "Low-K lean",
      body: `${last} has historically created a ${higher ? "higher" : "lower"} strikeout environment (${baselineK.toFixed(1)} avg K vs ${leagueAvgK.toFixed(1)} overall, ${higher ? "+" : ""}${(baselineK - leagueAvgK).toFixed(1)}).`,
      impact: higher ? "positive" : "negative",
      score: Math.abs(baselineK - leagueAvgK) + games.length / 40,
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
        body: `Under ${last}, ${best.label} has been strongest at ${(best.stats.winRate * 100).toFixed(0)}% (${best.stats.wins}W–${best.stats.losses}L).`,
        impact: "positive",
        score: best.stats.winRate + best.stats.total / 100,
      });
    }
    if (worst !== best && worst.stats.total >= 3 && worst.stats.winRate + 0.08 <= best.stats.winRate) {
      notes.push({
        title: "Softest strategy",
        body: `Under ${last}, ${worst.label} has been softest at ${(worst.stats.winRate * 100).toFixed(0)}% (${worst.stats.wins}W–${worst.stats.losses}L).`,
        impact: "negative",
        score: 1 - worst.stats.winRate + worst.stats.total / 100,
      });
    }
  }

  const pitchers = groupBy(games, (g) => String(g.pitcher || "").trim(), 2)
    .map((row) => {
      const k = avg(row.rows, "actual");
      return { ...row, avgK: k, delta: baselineK != null && k != null ? k - baselineK : null };
    })
    .filter((row) => row.avgK != null && row.delta != null && Math.abs(row.delta) >= 0.6)
    .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));

  pitchers.slice(0, 2).forEach((row, index) => {
    const better = (row.delta || 0) > 0;
    notes.push({
      title: index === 0 ? "Pitcher under ump" : "Another pitcher lean",
      body: `${row.label} has performed ${better ? "better" : "worse"} under ${last}, averaging ${row.avgK.toFixed(1)} Ks across ${row.games} starts (${better ? "+" : ""}${(row.delta || 0).toFixed(1)} vs this ump's mark).`,
      impact: better ? "positive" : "negative",
      score: Math.abs(row.delta || 0) + row.games / 10,
    });
  });

  const err = modelError(games);
  if (err.mae != null && err.sample >= 3) {
    if (err.mae <= 1.25) {
      notes.push({
        title: "Projection fit",
        body: `PitchIQ has tracked games under ${last} tightly — MAE ${err.mae.toFixed(2)} Ks (n=${err.sample}).`,
        impact: "positive",
        score: 2 - err.mae,
      });
    } else if (err.mae >= 1.65) {
      notes.push({
        title: "Projection noise",
        body: `Games under ${last} have been harder to pin — PitchIQ MAE ${err.mae.toFixed(2)} Ks (n=${err.sample}).`,
        impact: "negative",
        score: err.mae / 2,
      });
    }
    if (err.bias != null && Math.abs(err.bias) >= 0.3) {
      notes.push({
        title: err.bias > 0 ? "Over-projection lean" : "Under-projection lean",
        body:
          err.bias > 0
            ? `PitchIQ has tended to over-project under ${last} by about ${err.bias.toFixed(2)} Ks.`
            : `PitchIQ has tended to under-project under ${last} by about ${Math.abs(err.bias).toFixed(2)} Ks.`,
        impact: "neutral",
        score: Math.abs(err.bias),
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
export function umpireNamesFromGames(games) {
  const names = [
    ...new Set(
      (games || [])
        .map((g) => String(g.plateUmpire || "").trim())
        .filter(Boolean)
    ),
  ];
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}

/**
 * @param {GameRow[]} allGames
 * @param {string} umpireName
 */
export function buildUmpireProfile(allGames, umpireName) {
  const name = String(umpireName || "").trim();
  const league = (allGames || []).filter((g) => g.actual != null);
  const leagueAvgK = avg(league, "actual");
  const games = (allGames || [])
    .filter((g) => String(g.plateUmpire || "").trim() === name)
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
        delta: baselineK != null && avgK != null ? avgK - baselineK : null,
        dk: ouWinLoss(row.rows, "DK"),
        ek1: ekWinLoss(row.rows, 1),
      };
    })
    .sort((a, b) => b.games - a.games || String(a.pitcher).localeCompare(String(b.pitcher)));

  return {
    umpire: name,
    games: games.length,
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
    notes: buildUmpireNotes(games, leagueAvgK),
    recent: games.slice(0, 8),
  };
}
