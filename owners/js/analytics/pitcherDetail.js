/**
 * Pitcher-level analytics for the Owners Portal Pitchers page.
 * Derived from settled GameRow history already loaded in-memory.
 */

/** @typedef {import("../data/games.js").GameRow} GameRow */
/** @typedef {{ wins: number, losses: number, total: number, winRate: number }} WinLoss */
/** @typedef {{ id: string, label: string, tone: string, stats: WinLoss }} StrategyStat */
/** @typedef {{ title: string, body: string, impact: "positive"|"negative"|"neutral", score: number }} PitcherNote */

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

/** @param {string} name */
export function pitcherLastName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[parts.length - 1] || "This pitcher";
}

/** @param {string} value */
function normalizeSide(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v.startsWith("h")) return "Home";
  if (v.startsWith("a")) return "Away";
  return String(value || "").trim() || "Unknown";
}

/**
 * @param {GameRow[]} starts
 */
function avg(starts, key) {
  let sum = 0;
  let n = 0;
  for (const g of starts) {
    const v = g[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

/**
 * @param {GameRow[]} starts
 */
function modelError(starts) {
  let abs = 0;
  let signed = 0;
  let n = 0;
  for (const g of starts) {
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
 * @param {GameRow[]} starts
 * @param {(g: GameRow) => string} keyFn
 * @param {number} [minSample]
 */
function groupBy(starts, keyFn, minSample = 1) {
  /** @type {Map<string, GameRow[]>} */
  const map = new Map();
  for (const g of starts) {
    const key = keyFn(g);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  }
  return [...map.entries()]
    .map(([label, rows]) => ({ label, rows, games: rows.length }))
    .filter((r) => r.games >= minSample);
}

/**
 * @param {GameRow[]} starts
 * @returns {PitcherNote[]}
 */
function buildPitcherNotes(starts) {
  /** @type {PitcherNote[]} */
  const notes = [];
  if (!starts.length) return notes;
  const name = starts[0].pitcher || "This pitcher";
  const last = pitcherLastName(name);
  const baselineK = avg(starts, "actual");
  const dk = ouWinLoss(starts, "DK");
  const fd = ouWinLoss(starts, "FD");
  const ek0 = ekWinLoss(starts, 0);
  const ek1 = ekWinLoss(starts, 1);

  /** @type {StrategyStat[]} */
  const strategies = [
    { id: "dk", label: "DK O/U", tone: "book-dk", stats: dk },
    { id: "fd", label: "FD O/U", tone: "book-fd", stats: fd },
    { id: "ek0", label: "EK0", tone: "book-ek0", stats: ek0 },
    { id: "ek1", label: "EK-1", tone: "book-ek1", stats: ek1 },
  ].filter((s) => s.stats.total >= 2);

  if (strategies.length) {
    const ranked = [...strategies].sort(
      (a, b) => b.stats.winRate - a.stats.winRate || b.stats.total - a.stats.total
    );
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.stats.total >= 3) {
      notes.push({
        title: "Best strategy",
        body: `${last} has been strongest on ${best.label} at ${(best.stats.winRate * 100).toFixed(0)}% (${best.stats.wins}W–${best.stats.losses}L).`,
        impact: "positive",
        score: best.stats.winRate + best.stats.total / 100,
      });
    }
    if (worst !== best && worst.stats.total >= 3 && worst.stats.winRate + 0.08 <= best.stats.winRate) {
      notes.push({
        title: "Softest strategy",
        body: `${last} has struggled most on ${worst.label} at ${(worst.stats.winRate * 100).toFixed(0)}% (${worst.stats.wins}W–${worst.stats.losses}L).`,
        impact: "negative",
        score: 1 - worst.stats.winRate + worst.stats.total / 100,
      });
    }
  }

  if (baselineK != null) {
    notes.push({
      title: "K profile",
      body: `${last} is averaging ${baselineK.toFixed(1)} actual Ks across ${starts.length} settled start${starts.length === 1 ? "" : "s"} in range.`,
      impact: "neutral",
      score: 0.35,
    });

    const opponents = groupBy(starts, (g) => String(g.opponent || "").trim(), 1)
      .map((row) => {
        const k = avg(row.rows, "actual");
        return { ...row, avgK: k, delta: k == null ? 0 : k - baselineK };
      })
      .filter((row) => row.avgK != null && row.games >= 2 && Math.abs(row.delta) >= 0.45)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    opponents.slice(0, 2).forEach((opp, index) => {
      const better = opp.delta > 0;
      notes.push({
        title: index === 0 ? "Pitcher vs opponent" : "Another matchup lean",
        body: `${last} has historically performed ${better ? "better" : "worse"} against ${opp.label}, averaging ${opp.avgK.toFixed(1)} Ks across ${opp.games} starts (${better ? "+" : ""}${opp.delta.toFixed(1)} vs their overall mark).`,
        impact: better ? "positive" : "negative",
        score: Math.abs(opp.delta) + opp.games / 10,
      });
    });
  }

  const sides = groupBy(starts, (g) => normalizeSide(g.homeAway), 2).map((row) => ({
    ...row,
    avgK: avg(row.rows, "actual"),
    ek1: ekWinLoss(row.rows, 1),
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
        body: `${last} has been ${better ? "better" : "worse"} in ${top.label.toLowerCase()} starts (${(top.avgK || 0).toFixed(1)} avg Ks, n=${top.games}).`,
        impact: better ? "positive" : "negative",
        score: Math.abs((top.avgK || 0) - baselineK),
      });
    }
  }

  const err = modelError(starts);
  if (err.mae != null && err.sample >= 3) {
    if (err.mae <= 1.25) {
      notes.push({
        title: "Projection fit",
        body: `PitchIQ has tracked ${last} tightly — MAE ${err.mae.toFixed(2)} Ks across ${err.sample} settled starts.`,
        impact: "positive",
        score: 2 - err.mae,
      });
    } else if (err.mae >= 1.65) {
      notes.push({
        title: "Projection noise",
        body: `${last} has been harder to pin — PitchIQ MAE ${err.mae.toFixed(2)} Ks (n=${err.sample}).`,
        impact: "negative",
        score: err.mae / 2,
      });
    } else {
      notes.push({
        title: "Projection fit",
        body: `PitchIQ MAE on ${last} is ${err.mae.toFixed(2)} Ks across ${err.sample} settled starts.`,
        impact: "neutral",
        score: 0.55,
      });
    }
    if (err.bias != null && Math.abs(err.bias) >= 0.3) {
      notes.push({
        title: err.bias > 0 ? "Over-projection lean" : "Under-projection lean",
        body:
          err.bias > 0
            ? `PitchIQ has tended to over-project ${last} by about ${err.bias.toFixed(2)} Ks.`
            : `PitchIQ has tended to under-project ${last} by about ${Math.abs(err.bias).toFixed(2)} Ks.`,
        impact: "neutral",
        score: Math.abs(err.bias),
      });
    }
  }

  const confGroups = groupBy(
    starts,
    (g) => String(g.dkConfidence || "").trim(),
    3
  )
    .map((row) => ({ ...row, stats: ouWinLoss(row.rows, "DK") }))
    .filter((row) => row.stats.total >= 3)
    .sort((a, b) => b.stats.winRate - a.stats.winRate);

  if (confGroups.length >= 2) {
    const best = confGroups[0];
    const worst = confGroups[confGroups.length - 1];
    if (best.stats.winRate - worst.stats.winRate >= 0.08) {
      notes.push({
        title: "DK confidence edge",
        body: `${last}'s DK results look ${best.stats.winRate >= 0.55 ? "strongest" : "cleanest"} in ${best.label} confidence (${(best.stats.winRate * 100).toFixed(0)}%, ${best.stats.wins}W–${best.stats.losses}L).`,
        impact: best.stats.winRate >= 0.55 ? "positive" : "neutral",
        score: best.stats.winRate - worst.stats.winRate,
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

/**
 * @param {GameRow[]} allGames
 * @param {string} pitcherName
 */
export function buildPitcherProfile(allGames, pitcherName) {
  const name = String(pitcherName || "").trim();
  const starts = (allGames || [])
    .filter((g) => String(g.pitcher || "").trim() === name)
    .slice()
    .sort((a, b) => {
      const at = a.date ? a.date.getTime() : 0;
      const bt = b.date ? b.date.getTime() : 0;
      return bt - at;
    });

  if (!starts.length) return null;

  const dk = ouWinLoss(starts, "DK");
  const fd = ouWinLoss(starts, "FD");
  const ek0 = ekWinLoss(starts, 0);
  const ek1 = ekWinLoss(starts, 1);
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

  const baselineK = avg(starts, "actual");
  const opponents = groupBy(starts, (g) => String(g.opponent || "").trim(), 1)
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

  const homeAway = groupBy(starts, (g) => normalizeSide(g.homeAway), 1).map((row) => ({
    side: row.label,
    games: row.games,
    avgK: avg(row.rows, "actual"),
    dk: ouWinLoss(row.rows, "DK"),
    fd: ouWinLoss(row.rows, "FD"),
    ek0: ekWinLoss(row.rows, 0),
    ek1: ekWinLoss(row.rows, 1),
  }));

  const teams = [...new Set(starts.map((g) => String(g.pitcherTeam || "").trim()).filter(Boolean))];
  const dated = starts.filter((g) => g.date);
  const err = modelError(starts);

  return {
    pitcher: name,
    team: teams[0] || "—",
    teams,
    starts: starts.length,
    dateStart: dated.length ? dated[dated.length - 1].date : null,
    dateEnd: dated.length ? dated[0].date : null,
    avgActual: baselineK,
    avgEnsemble: avg(starts, "ensemble"),
    avgDkLine: avg(starts, "dkLine"),
    avgFdLine: avg(starts, "fdLine"),
    avgVix: avg(starts, "vix"),
    mae: err.mae,
    bias: err.bias,
    strategies,
    bestStrategy: ranked[0] || null,
    worstStrategy: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    homeAway,
    opponents,
    notes: buildPitcherNotes(starts),
    recent: starts.slice(0, 8),
  };
}
