/** @typedef {{ wins: number, losses: number, total: number, winRate: number }} WinLoss */

const VIX_LOW_MAX = 0.24;
const VIX_MED_MAX = 0.74;
const BREAKEVEN_110 = 0.524;

const ENSEMBLE_RANGES = [
  ["2-3 Ks", 2, 3, 2],
  ["3-4 Ks", 3, 4, 3],
  ["4-5 Ks", 4, 5, 4],
  ["5-6 Ks", 5, 6, 5],
  ["6-7 Ks", 6, 7, 6],
  ["7+ Ks", 7, null, 7],
];

const FD_LINES = [3.5, 4.5, 5.5, 6.5, 7.5];
const LINE_BUCKETS = [
  ["≤4 Ks", [2.5, 3.5]],
  ["4.5-5.5 Ks", [4.5, 5.5]],
  ["6-6.5 Ks", [6.5]],
  ["7+ Ks", [7.5, 8.5, 9.5]],
];

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

/** @param {import("../data/games.js").GameRow[]} games @param {"DK"|"FD"} book */
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

/** @param {import("../data/games.js").GameRow[]} games @param {number} offset */
function ekWinLoss(games, offset = 0) {
  const flags = [];
  for (const game of games) {
    if (game.ensemble == null || game.actual == null) continue;
    const threshold = Math.floor(game.ensemble) - offset;
    flags.push(game.actual >= threshold);
  }
  return wlFromFlags(flags);
}

const MODEL_SPECS = [
  ["PitchIQ K", "ensemble"],
  ["Poisson", "poisson"],
  ["Linear", "linear"],
  ["Nonlinear", "nonlinear"],
];

/**
 * Hit when |prediction − actual| ≤ maxDiff (default within 1 K).
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"poisson"|"linear"|"nonlinear"|"ensemble"} key
 * @param {number} [maxDiff]
 */
function modelWithinDiffWinLoss(games, key, maxDiff = 1) {
  const flags = [];
  for (const game of games) {
    const pred = game[key];
    if (pred == null || game.actual == null) continue;
    flags.push(Math.abs(pred - game.actual) <= maxDiff);
  }
  return wlFromFlags(flags);
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"poisson"|"linear"|"nonlinear"|"ensemble"} key
 */
function modelErrorStats(games, key) {
  const errors = [];
  for (const game of games) {
    const pred = game[key];
    if (pred == null || game.actual == null) continue;
    errors.push(pred - game.actual);
  }
  const sample = errors.length;
  if (!sample) {
    return { mae: null, rmse: null, bias: null, sample: 0, within1: wl(0, 0) };
  }
  const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / sample;
  const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / sample);
  const bias = errors.reduce((s, e) => s + e, 0) / sample;
  const within1 = wlFromFlags(errors.map((e) => Math.abs(e) <= 1));
  return { mae, rmse, bias, sample, within1 };
}

/** @param {import("../data/games.js").GameRow[]} games */
function modelAccuracy(games) {
  return MODEL_SPECS.map(([label, key]) => {
    const stats = modelErrorStats(games, /** @type {"poisson"|"linear"|"nonlinear"|"ensemble"} */ (key));
    return {
      model: label,
      key,
      mae: stats.mae,
      rmse: stats.rmse,
      bias: stats.bias,
      sample: stats.sample,
      within1: stats.within1,
    };
  });
}

/** PitchIQ K accuracy ladders: |pred − actual| ≤ N */
const WITHIN_THRESHOLDS = [1, 2, 3, 4, 5];

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"poisson"|"linear"|"nonlinear"|"ensemble"} [key]
 */
function withinLadder(games, key = "ensemble") {
  return WITHIN_THRESHOLDS.map((n) => {
    const stats = modelWithinDiffWinLoss(games, key, n);
    return { within: n, label: `Within ${n} K`, ...stats };
  });
}

/**
 * PitchIQ K deep-dive: within-N ladder, MAE/bias, monthly trend, projection & location splits.
 * @param {import("../data/games.js").GameRow[]} games
 */
function modelDeepDive(games) {
  const stats = modelErrorStats(games, "ensemble");
  const ladder = withinLadder(games, "ensemble");
  const within1 = ladder.find((r) => r.within === 1) || wl(0, 0);

  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const months = new Map();
  for (const game of games) {
    if (!game.date) continue;
    const y = game.date.getFullYear();
    const m = String(game.date.getMonth() + 1).padStart(2, "0");
    const key = `${y}-${m}`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(game);
  }
  const monthly = [...months.keys()].sort().map((month) => {
    const subset = months.get(month) || [];
    /** @type {Record<number, number>} */
    const rates = {};
    for (const n of WITHIN_THRESHOLDS) {
      rates[n] = modelWithinDiffWinLoss(subset, "ensemble", n).winRate;
    }
    return {
      month,
      games: subset.length,
      rates,
      within1: rates[1] || 0,
      within2: rates[2] || 0,
      within3: rates[3] || 0,
    };
  });

  const projectionRanges = ENSEMBLE_RANGES.map(([label, low, high]) => {
    const subset = games.filter((g) => {
      const v = g.ensemble;
      if (v == null) return false;
      if (high == null) return v >= low;
      return v >= low && v < high;
    });
    const err = modelErrorStats(subset, "ensemble");
    return {
      label,
      games: subset.length,
      mae: err.mae,
      bias: err.bias,
      ladder: withinLadder(subset, "ensemble"),
    };
  });

  const location = ["Home", "Away"].map((loc) => {
    const subset = games.filter((g) => String(g.homeAway || "").toLowerCase() === loc.toLowerCase());
    const err = modelErrorStats(subset, "ensemble");
    return {
      label: loc,
      games: subset.length,
      mae: err.mae,
      bias: err.bias,
      ladder: withinLadder(subset, "ensemble"),
    };
  });

  const errorBuckets = [
    { label: "≤0.5 K", test: (a) => a <= 0.5 },
    { label: "0.5–1 K", test: (a) => a > 0.5 && a <= 1 },
    { label: "1–2 K", test: (a) => a > 1 && a <= 2 },
    { label: "2–3 K", test: (a) => a > 2 && a <= 3 },
    { label: "3–4 K", test: (a) => a > 3 && a <= 4 },
    { label: ">4 K", test: (a) => a > 4 },
  ].map(({ label, test }) => {
    let total = 0;
    let inBucket = 0;
    for (const game of games) {
      if (game.ensemble == null || game.actual == null) continue;
      total += 1;
      if (test(Math.abs(game.ensemble - game.actual))) inBucket += 1;
    }
    return { label, count: inBucket, rate: total ? inBucket / total : 0, total };
  });

  return {
    sample: stats.sample,
    mae: stats.mae,
    rmse: stats.rmse,
    bias: stats.bias,
    within1,
    ladder,
    monthly,
    projectionRanges,
    location,
    errorBuckets,
  };
}

/** @param {number | null} vix */
function assignVixTier(vix) {
  if (vix == null) return "Unknown";
  if (vix <= VIX_LOW_MAX) return "Low";
  if (vix <= VIX_MED_MAX) return "Medium";
  return "High";
}

/** @param {Date | null} date
 * @param {"daily"|"weekly"|"monthly"|"yearly"} period
 */
function periodKey(date, period) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (period === "daily") return `${y}-${m}-${d}`;
  if (period === "yearly") return String(y);
  if (period === "weekly") {
    const tmp = new Date(Date.UTC(y, date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const isoYear = tmp.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
  }
  return `${y}-${m}`;
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"daily"|"weekly"|"monthly"|"yearly"} [period]
 */
function periodBreakdown(games, period = "monthly") {
  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const groups = new Map();
  for (const game of games) {
    const key = periodKey(game.date, period);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }
  const keys = [...groups.keys()].sort();
  return keys.map((key) => {
    const subset = groups.get(key) || [];
    const fd = ouWinLoss(subset, "FD");
    const dk = ouWinLoss(subset, "DK");
    const ek0 = ekWinLoss(subset, 0);
    const ek1 = ekWinLoss(subset, 1);
    return {
      label: key,
      month: key,
      games: subset.length,
      fdWinRate: fd.winRate,
      dkWinRate: dk.winRate,
      ek0WinRate: ek0.winRate,
      ek1WinRate: ek1.winRate,
      fdSample: fd.total,
      dkSample: dk.total,
      ek0Sample: ek0.total,
      ek1Sample: ek1.total,
    };
  });
}

/** @param {import("../data/games.js").GameRow[]} games */
function monthlyBreakdown(games) {
  return periodBreakdown(games, "monthly");
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {number} offset
 */
function strategyBreakdown(games, offset) {
  const base = games.filter((g) => g.ensemble != null && g.actual != null);
  const overallFlags = base.map((g) => g.actual >= Math.floor(g.ensemble) - offset);
  const overall = wlFromFlags(overallFlags);

  const ensembleRange = ENSEMBLE_RANGES.map(([label, low, high, rangeThr]) => {
    const subset = base.filter((g) => {
      const v = g.ensemble;
      if (v == null) return false;
      if (high == null) return v >= low;
      return v >= low && v < high;
    });
    const flags = subset.map((g) => g.actual >= rangeThr - offset);
    const stats = wlFromFlags(flags);
    return { label, ...stats };
  });

  const fdLine = FD_LINES.map((line) => {
    const subset = base.filter((g) => g.fdLine === line);
    const flags = subset.map((g) => g.actual >= Math.floor(g.ensemble) - offset);
    return { label: `${line} Line`, ...wlFromFlags(flags) };
  });

  const confidence = ["High", "Medium", "Low"].map((tier) => {
    const subset = base.filter((g) => g.fdConfidence.toLowerCase() === tier.toLowerCase());
    const flags = subset.map((g) => g.actual >= Math.floor(g.ensemble) - offset);
    return { label: tier, ...wlFromFlags(flags) };
  });

  const location = ["Home", "Away"].map((loc) => {
    const subset = base.filter((g) => g.homeAway.toLowerCase() === loc.toLowerCase());
    const flags = subset.map((g) => g.actual >= Math.floor(g.ensemble) - offset);
    return { label: loc, ...wlFromFlags(flags) };
  });

  const vix = ["High", "Medium", "Low"].map((tier) => {
    const subset = base.filter((g) => assignVixTier(g.vix) === tier);
    const flags = subset.map((g) => g.actual >= Math.floor(g.ensemble) - offset);
    return { label: tier, ...wlFromFlags(flags) };
  });

  return { overall, ensembleRange, fdLine, confidence, location, vix };
}

/** @param {import("../data/games.js").GameRow[]} games */
function confidenceBreakdown(games) {
  const rows = [];
  for (const tier of ["High", "Medium", "Low"]) {
    for (const book of ["DK", "FD"]) {
      const subset = games.filter((g) => {
        const conf = book === "DK" ? g.dkConfidence : g.fdConfidence;
        return conf.toLowerCase() === tier.toLowerCase();
      });
      const stats = ouWinLoss(subset, book);
      rows.push({ confidence: tier, book, ...stats });
    }
  }
  return rows;
}

/** @param {import("../data/games.js").GameRow[]} games */
function lineBucketBreakdown(games) {
  const rows = [];
  for (const [label, lines] of LINE_BUCKETS) {
    for (const book of ["DK", "FD"]) {
      const subset = games.filter((g) => {
        const line = book === "DK" ? g.dkLine : g.fdLine;
        return line != null && lines.includes(line);
      });
      rows.push({ lineRange: label, book, ...ouWinLoss(subset, book) });
    }
  }
  return rows;
}

/** @param {import("../data/games.js").GameRow[]} games */
function homeAwayBreakdown(games) {
  return ["Home", "Away"].map((loc) => {
    const subset = games.filter((g) => g.homeAway.toLowerCase() === loc.toLowerCase());
    return {
      location: loc,
      dk: ouWinLoss(subset, "DK"),
      fd: ouWinLoss(subset, "FD"),
      ek0: ekWinLoss(subset, 0),
      ek1: ekWinLoss(subset, 1),
      games: subset.length,
    };
  });
}

/** @param {import("../data/games.js").GameRow[]} games */
function pitcherLeaderboard(games) {
  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const byPitcher = new Map();
  for (const game of games) {
    if (!game.pitcher || game.ensemble == null || game.actual == null) continue;
    if (!byPitcher.has(game.pitcher)) byPitcher.set(game.pitcher, []);
    byPitcher.get(game.pitcher).push(game);
  }
  const rows = [...byPitcher.entries()].map(([pitcher, subset]) => {
    const ek1 = ekWinLoss(subset, 1);
    const ek0 = ekWinLoss(subset, 0);
    const dk = ouWinLoss(subset, "DK");
    const fd = ouWinLoss(subset, "FD");
    return {
      pitcher,
      games: subset.length,
      ek1,
      ek0,
      dk,
      fd,
    };
  });
  const qualified = rows.filter((r) => r.ek1.total >= 5);
  const byEk1 = [...qualified].sort((a, b) => b.ek1.winRate - a.ek1.winRate || b.ek1.total - a.ek1.total);

  const topN = (key, n = 10) => {
    const q = rows.filter((r) => r[key].total >= 5);
    return [...q].sort((a, b) => b[key].winRate - a[key].winRate || b[key].total - a[key].total).slice(0, n);
  };
  const botN = (key, n = 10) => {
    const q = rows.filter((r) => r[key].total >= 5);
    return [...q].sort((a, b) => a[key].winRate - b[key].winRate || b[key].total - a[key].total).slice(0, n);
  };

  return {
    top: byEk1.slice(0, 15),
    bottom: [...byEk1].reverse().slice(0, 15),
    best: { dk: topN("dk"), fd: topN("fd"), ek0: topN("ek0"), ek1: topN("ek1") },
    worst: { dk: botN("dk"), fd: botN("fd"), ek0: botN("ek0"), ek1: botN("ek1") },
    roster: byEk1,
    qualifiedCount: qualified.length,
  };
}

/**
 * Rank entities (teams / umps) by strategy for dashboard boards.
 * @param {import("../data/games.js").GameRow[]} games
 * @param {(g: import("../data/games.js").GameRow) => string} keyFn
 * @param {number} [minSample]
 */
function contextLeaderboard(games, keyFn, minSample = 8) {
  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const byKey = new Map();
  for (const game of games) {
    const key = String(keyFn(game) || "").trim();
    if (!key || game.ensemble == null || game.actual == null) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(game);
  }

  const rows = [...byKey.entries()].map(([name, subset]) => {
    const ek1 = ekWinLoss(subset, 1);
    const ek0 = ekWinLoss(subset, 0);
    const dk = ouWinLoss(subset, "DK");
    const fd = ouWinLoss(subset, "FD");
    return {
      name,
      games: subset.length,
      ek1,
      ek0,
      dk,
      fd,
    };
  });

  /** @param {"dk"|"fd"|"ek0"|"ek1"} key @param {number} [n] */
  const topN = (key, n = 10) => {
    const q = rows.filter((r) => r[key].total >= minSample);
    return [...q].sort((a, b) => b[key].winRate - a[key].winRate || b[key].total - a[key].total).slice(0, n);
  };
  /** @param {"dk"|"fd"|"ek0"|"ek1"} key @param {number} [n] */
  const botN = (key, n = 10) => {
    const q = rows.filter((r) => r[key].total >= minSample);
    return [...q].sort((a, b) => a[key].winRate - b[key].winRate || b[key].total - a[key].total).slice(0, n);
  };

  return {
    best: { dk: topN("dk"), fd: topN("fd"), ek0: topN("ek0"), ek1: topN("ek1") },
    worst: { dk: botN("dk"), fd: botN("fd"), ek0: botN("ek0"), ek1: botN("ek1") },
    minSample,
  };
}

/** @param {import("../data/games.js").GameRow[]} games */
function teamLeaderboard(games) {
  return contextLeaderboard(games, (g) => g.pitcherTeam, 8);
}

/** @param {import("../data/games.js").GameRow[]} games */
function umpireLeaderboard(games) {
  return contextLeaderboard(games, (g) => g.plateUmpire, 8);
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function overUnderBreakdown(games, book) {
  const overs = games.filter((g) => (book === "DK" ? g.dkBet : g.fdBet) === "OVER");
  const unders = games.filter((g) => (book === "DK" ? g.dkBet : g.fdBet) === "UNDER");
  return {
    over: ouWinLoss(overs, book),
    under: ouWinLoss(unders, book),
  };
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 * @param {number} days
 */
function recentWindow(games, book, days) {
  const dated = games.filter((g) => g.date);
  if (!dated.length) {
    const empty = wl(0, 0);
    return { days, games: 0, ...empty };
  }
  const end = Math.max(...dated.map((g) => /** @type {Date} */ (g.date).getTime()));
  const start = end - days * 86400000;
  const subset = dated.filter((g) => /** @type {Date} */ (g.date).getTime() >= start);
  const stats = ouWinLoss(subset, book);
  return { days, games: subset.length, ...stats };
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookConfidence(games, book) {
  return ["High", "Medium", "Low"].map((tier) => {
    const subset = games.filter((g) => {
      const conf = book === "DK" ? g.dkConfidence : g.fdConfidence;
      return String(conf || "").toLowerCase() === tier.toLowerCase();
    });
    const stats = ouWinLoss(subset, book);
    return { label: tier, ...stats };
  });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookLineBuckets(games, book) {
  return LINE_BUCKETS.map(([label, lines]) => {
    const subset = games.filter((g) => {
      const line = book === "DK" ? g.dkLine : g.fdLine;
      return line != null && lines.includes(line);
    });
    const stats = ouWinLoss(subset, book);
    return { label, ...stats };
  });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookExactLines(games, book) {
  /** @type {Map<number, import("../data/games.js").GameRow[]>} */
  const byLine = new Map();
  for (const game of games) {
    const line = book === "DK" ? game.dkLine : game.fdLine;
    if (line == null) continue;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push(game);
  }
  return [...byLine.keys()]
    .sort((a, b) => a - b)
    .map((line) => {
      const stats = ouWinLoss(byLine.get(line) || [], book);
      return { label: String(line), line, ...stats };
    });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookHomeAway(games, book) {
  return ["Home", "Away"].map((loc) => {
    const subset = games.filter((g) => String(g.homeAway || "").toLowerCase() === loc.toLowerCase());
    const stats = ouWinLoss(subset, book);
    return { label: loc, games: subset.length, ...stats };
  });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookVix(games, book) {
  return ["High", "Medium", "Low"].map((tier) => {
    const subset = games.filter((g) => assignVixTier(g.vix) === tier);
    const stats = ouWinLoss(subset, book);
    return { label: tier, ...stats };
  });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookEnsembleRanges(games, book) {
  return ENSEMBLE_RANGES.map(([label, low, high]) => {
    const subset = games.filter((g) => {
      const v = g.ensemble;
      if (v == null) return false;
      if (high == null) return v >= low;
      return v >= low && v < high;
    });
    const stats = ouWinLoss(subset, book);
    return { label, ...stats };
  });
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookMonthly(games, book) {
  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const groups = new Map();
  for (const game of games) {
    if (!game.date) continue;
    const y = game.date.getFullYear();
    const m = String(game.date.getMonth() + 1).padStart(2, "0");
    const key = `${y}-${m}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(game);
  }
  return [...groups.keys()].sort().map((month) => {
    const subset = groups.get(month) || [];
    const stats = ouWinLoss(subset, book);
    return { month, games: subset.length, ...stats };
  });
}

/**
 * Pitcher leaderboards for a book page: O/U (book-specific) plus EK0 / EK-1.
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 * @param {number} [minSample]
 */
function bookPitchers(games, book, minSample = 5) {
  /** @type {Map<string, import("../data/games.js").GameRow[]>} */
  const byPitcher = new Map();
  for (const game of games) {
    if (!game.pitcher || game.ensemble == null || game.actual == null) continue;
    if (!byPitcher.has(game.pitcher)) byPitcher.set(game.pitcher, []);
    byPitcher.get(game.pitcher).push(game);
  }

  const rows = [...byPitcher.entries()].map(([pitcher, subset]) => ({
    pitcher,
    games: subset.length,
    ou: ouWinLoss(subset, book),
    ek0: ekWinLoss(subset, 0),
    ek1: ekWinLoss(subset, 1),
  }));

  /** @param {"ou"|"ek0"|"ek1"} key @param {"best"|"worst"} tone @param {number} [n] */
  const pick = (key, tone, n = 15) => {
    const qualified = rows.filter((r) => r[key].total >= minSample);
    const sorted =
      tone === "best"
        ? [...qualified].sort((a, b) => b[key].winRate - a[key].winRate || b[key].total - a[key].total)
        : [...qualified].sort((a, b) => a[key].winRate - b[key].winRate || b[key].total - a[key].total);
    return sorted.slice(0, n).map((r) => ({ pitcher: r.pitcher, games: r.games, ...r[key] }));
  };

  return {
    ou: { best: pick("ou", "best"), worst: pick("ou", "worst") },
    ek0: { best: pick("ek0", "best"), worst: pick("ek0", "worst") },
    ek1: { best: pick("ek1", "best"), worst: pick("ek1", "worst") },
  };
}

/**
 * @param {{ label: string, winRate: number, total: number }[]} segments
 * @param {number} [minSample]
 */
function pickPlaybook(segments, minSample = 40) {
  const qualified = segments.filter((s) => s.total >= minSample);
  const best = [...qualified].sort((a, b) => b.winRate - a.winRate || b.total - a.total).slice(0, 10);
  const avoid = [...qualified].sort((a, b) => a.winRate - b.winRate || b.total - a.total).slice(0, 10);
  return { best, avoid };
}

/**
 * Full sportsbook deep-dive used by DraftKings / FanDuel pages.
 * @param {import("../data/games.js").GameRow[]} games
 * @param {"DK"|"FD"} book
 */
function bookDeepDive(games, book) {
  const overall = ouWinLoss(games, book);
  const sides = overUnderBreakdown(games, book);
  const confidence = bookConfidence(games, book);
  const lineBuckets = bookLineBuckets(games, book);
  const exactLines = bookExactLines(games, book);
  const location = bookHomeAway(games, book);
  const vix = bookVix(games, book);
  const ensembleRanges = bookEnsembleRanges(games, book);
  const monthly = bookMonthly(games, book);
  const pitchers = bookPitchers(games, book);
  const recent30 = recentWindow(games, book, 30);
  const recent7 = recentWindow(games, book, 7);

  const playbookPool = [
    ...confidence.map((r) => ({ ...r, label: `${r.label} confidence` })),
    ...lineBuckets.map((r) => ({ ...r, label: `${r.label} lines` })),
    ...location.map((r) => ({ ...r, label: r.label })),
    ...ensembleRanges.map((r) => ({ ...r, label: `Proj ${r.label}` })),
    { label: "Overs", ...sides.over },
    { label: "Unders", ...sides.under },
  ];

  return {
    book,
    overall,
    recent7,
    recent30,
    sides,
    confidence,
    lineBuckets,
    exactLines,
    location,
    vix,
    ensembleRanges,
    monthly,
    pitchers,
    playbook: pickPlaybook(playbookPool),
  };
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @param {WinLoss} fd
 * @param {WinLoss} dk
 * @param {WinLoss} ek0
 * @param {WinLoss} ek1
 * @param {{ model: string, mae: number | null }[]} models
 */
function keyFindings(games, fd, dk, ek0, ek1, models) {
  const ensemble = models.find((m) => m.model === "PitchIQ K" || m.model === "Ensemble");
  const findings = [
    `${games.length.toLocaleString()} settled starts in range.`,
    `DK O/U ${pct(dk.winRate)} (${dk.wins}W-${dk.losses}L) · FD O/U ${pct(fd.winRate)} (${fd.wins}W-${fd.losses}L).`,
    `EK0 ${pct(ek0.winRate)} · EK-1 ${pct(ek1.winRate)} (breakeven ~${pct(BREAKEVEN_110)} at -110).`,
  ];
  if (ensemble?.mae != null) findings.push(`PitchIQ K MAE ${ensemble.mae.toFixed(3)} Ks.`);
  return findings;
}

/** @param {number} rate */
function pct(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 */
export function runAnalysis(games) {
  const dated = games.filter((g) => g.date).map((g) => g.date.getTime());
  const dateStart = dated.length ? new Date(Math.min(...dated)) : null;
  const dateEnd = dated.length ? new Date(Math.max(...dated)) : null;
  const fd = ouWinLoss(games, "FD");
  const dk = ouWinLoss(games, "DK");
  const ek0 = ekWinLoss(games, 0);
  const ek1 = ekWinLoss(games, 1);
  const models = modelAccuracy(games);
  const monthly = monthlyBreakdown(games);

  return {
    summary: {
      games: games.length,
      dateStart,
      dateEnd,
      fd,
      dk,
      ek0,
      ek1,
      poisson: modelWithinDiffWinLoss(games, "poisson", 1),
      linear: modelWithinDiffWinLoss(games, "linear", 1),
      nonlinear: modelWithinDiffWinLoss(games, "nonlinear", 1),
      pitchiq: modelWithinDiffWinLoss(games, "ensemble", 1),
      breakeven: BREAKEVEN_110,
    },
    models,
    monthly,
    trends: {
      daily: periodBreakdown(games, "daily"),
      weekly: periodBreakdown(games, "weekly"),
      monthly,
      yearly: periodBreakdown(games, "yearly"),
    },
    confidence: confidenceBreakdown(games),
    lineBuckets: lineBucketBreakdown(games),
    homeAway: homeAwayBreakdown(games),
    ek0Breakdown: strategyBreakdown(games, 0),
    ek1Breakdown: strategyBreakdown(games, 1),
    pitchers: pitcherLeaderboard(games),
    teams: teamLeaderboard(games),
    umpires: umpireLeaderboard(games),
    draftkings: bookDeepDive(games, "DK"),
    fanduel: bookDeepDive(games, "FD"),
    modelDive: modelDeepDive(games),
    findings: keyFindings(games, fd, dk, ek0, ek1, models),
  };
}
