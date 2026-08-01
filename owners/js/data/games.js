/** @typedef {{
 *  pitcher: string,
 *  pitcherTeam: string,
 *  opponent: string,
 *  date: Date | null,
 *  homeAway: string,
 *  plateUmpire: string,
 *  dkLine: number | null,
 *  fdLine: number | null,
 *  dkBet: string,
 *  fdBet: string,
 *  dkCorrect: string,
 *  fdCorrect: string,
 *  poisson: number | null,
 *  linear: number | null,
 *  nonlinear: number | null,
 *  ensemble: number | null,
 *  actual: number | null,
 *  dkConfidence: string,
 *  fdConfidence: string,
 *  vix: number | null,
 * }} GameRow */

const ALIASES = {
  pitcher: ["pitcher"],
  pitcherTeam: ["pitcher's team", "pitcher team", "pitcher_team"],
  opponent: ["opponent"],
  date: ["date", "game date", "game_date"],
  homeAway: ["home/away", "home_or_away", "home or away"],
  plateUmpire: [
    "plate umpire",
    "plate ump",
    "plate_umpire",
    "home plate umpire",
    "home_plate_umpire",
    "umpire",
    "ump",
  ],
  dkLine: ["dk o/u line", "dk_line", "dk line"],
  fdLine: ["fd o/u line", "fd_line", "fd line"],
  dkBet: ["dk bet", "dk_bet"],
  fdBet: ["fd bet", "fd_bet"],
  dkCorrect: ["dk correct?", "dk correct", "dk_correct", "dk o/u result"],
  fdCorrect: ["fd correct?", "fd correct", "fd_correct", "fd o/u result"],
  poisson: ["poisson ks", "poisson", "poisson_prediction"],
  linear: ["linear ks", "linear", "linear_prediction"],
  nonlinear: ["nonlinear ks", "nonlinear", "nonlinear_prediction"],
  ensemble: ["ensemble ks", "ensemble", "ensemble_prediction", "pitchiq ks", "ek"],
  actual: ["actual ks", "actual_k", "strikeouts", "actual"],
  dkConfidence: ["dk confidence", "dk_confidence"],
  fdConfidence: ["fd confidence", "fd_confidence"],
  vix: ["vix amount", "vix", "volatility_score", "volatility"],
};

/**
 * @param {unknown[]} headers
 * @returns {Record<string, number>}
 */
export function buildColumnIndex(headers) {
  /** @type {Record<string, number>} */
  const index = {};
  const normalized = headers.map((h) => String(h ?? "").trim().toLowerCase());
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const found = aliases
      .map((alias) => normalized.indexOf(alias))
      .find((i) => i >= 0);
    if (found !== undefined) index[key] = found;
  }
  return index;
}

/** @param {unknown} value */
function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[%$,]/g, "").trim();
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value */
function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86400000);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      return d;
    }
  }
  const parsed = Date.parse(String(value ?? ""));
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {unknown} value */
function toText(value) {
  return String(value ?? "").trim();
}

/** @param {unknown} value */
function normalizeUmpireName(value) {
  const name = toText(value);
  if (!name) return "";
  const key = name.toLowerCase();
  if (
    key === "pending" ||
    key === "unknown" ||
    key === "n/a" ||
    key === "na" ||
    key === "none" ||
    key === "-"
  ) {
    return "";
  }
  return name;
}

/**
 * Mirror website exportBetCorrectness for O/U settled results.
 * @param {unknown} actualValue
 * @param {unknown} lineValue
 * @param {unknown} betValue
 * @param {unknown} [projectedStrikeouts]
 */
function betCorrectness(actualValue, lineValue, betValue, projectedStrikeouts = null) {
  const actual = toNumber(actualValue);
  const line = toNumber(lineValue);
  if (actual == null || line == null) return "";
  let bet = toText(betValue).toUpperCase();
  if (!bet || bet === "PASS" || bet === "N/A") {
    const projected = toNumber(projectedStrikeouts);
    if (projected == null || projected === line) bet = "";
    else bet = projected > line ? "OVER" : "UNDER";
  }
  if (!bet) return "";
  if (actual === line) return "push";
  if (bet === "OVER") return actual > line ? "yes" : "no";
  if (bet === "UNDER") return actual < line ? "yes" : "no";
  return "";
}

/**
 * @param {object} payload
 * @returns {GameRow | null}
 */
export function normalizeGameFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const pitcher = toText(payload.pitcher);
  const ensemble = toNumber(
    payload.ensemble_prediction ??
      payload.projected_strikeouts ??
      payload.final_EK ??
      payload.adjusted_EK_full
  );
  const actual = toNumber(payload.actual_k ?? payload.strikeouts);
  if (!pitcher && ensemble == null && actual == null) return null;

  const dkBet = toText(payload.dk_bet).toUpperCase();
  const fdBet = toText(payload.fd_bet).toUpperCase();
  const projected = ensemble;

  return {
    pitcher,
    pitcherTeam: toText(payload.pitcher_team),
    opponent: toText(payload.opponent),
    date: toDate(payload.game_date_raw || payload.game_date || payload.date || payload.sort_datetime),
    homeAway: toText(payload.home_or_away || payload.homeAway),
    plateUmpire: normalizeUmpireName(
      payload.plate_umpire ?? payload.home_plate_umpire ?? payload.plate_ump ?? payload.umpire
    ),
    dkLine: toNumber(payload.dk_line),
    fdLine: toNumber(payload.fd_line),
    dkBet,
    fdBet,
    dkCorrect: toText(
      payload.dk_correct ||
        payload.dk_result ||
        betCorrectness(actual, payload.dk_line, dkBet, projected)
    ).toLowerCase(),
    fdCorrect: toText(
      payload.fd_correct ||
        payload.fd_result ||
        betCorrectness(actual, payload.fd_line, fdBet, projected)
    ).toLowerCase(),
    poisson: toNumber(payload.poisson_prediction),
    linear: toNumber(payload.linear_prediction),
    nonlinear: toNumber(payload.nonlinear_prediction),
    ensemble,
    actual,
    dkConfidence: toText(payload.dk_confidence),
    fdConfidence: toText(payload.fd_confidence),
    vix: toNumber(payload.volatility_score ?? payload.vix_amount ?? payload.vix),
  };
}

/**
 * @param {object[]} payloads
 * @returns {GameRow[]}
 */
export function normalizeGamesFromPayloads(payloads) {
  /** @type {GameRow[]} */
  const games = [];
  for (const payload of payloads) {
    const game = normalizeGameFromPayload(payload);
    if (game) games.push(game);
  }
  if (!games.length) {
    throw new Error("No usable PitchIQ historical rows found in Supabase.");
  }
  return games;
}

/**
 * @param {unknown[]} headers
 * @param {unknown[][]} rows
 * @returns {GameRow[]}
 */
export function normalizeGames(headers, rows) {
  const index = buildColumnIndex(headers);
  if (index.pitcher === undefined) {
    throw new Error(
      "This workbook does not look like a PitchIQ Game History export. Expected a Pitcher column plus Ensemble Ks / Actual Ks."
    );
  }
  if (index.actual === undefined || index.ensemble === undefined) {
    throw new Error(
      "Missing required PitchIQ columns (Ensemble Ks and Actual Ks). Use a historical games export."
    );
  }

  /** @type {GameRow[]} */
  const games = [];
  for (const row of rows) {
    const get = (key) => (index[key] === undefined ? null : row[index[key]]);
    const actual = toNumber(get("actual"));
    const ensemble = toNumber(get("ensemble"));
    if (actual == null && ensemble == null && !toText(get("pitcher"))) continue;
    games.push({
      pitcher: toText(get("pitcher")),
      pitcherTeam: toText(get("pitcherTeam")),
      opponent: toText(get("opponent")),
      date: toDate(get("date")),
      homeAway: toText(get("homeAway")),
      plateUmpire: normalizeUmpireName(get("plateUmpire")),
      dkLine: toNumber(get("dkLine")),
      fdLine: toNumber(get("fdLine")),
      dkBet: toText(get("dkBet")).toUpperCase(),
      fdBet: toText(get("fdBet")).toUpperCase(),
      dkCorrect: toText(get("dkCorrect")).toLowerCase(),
      fdCorrect: toText(get("fdCorrect")).toLowerCase(),
      poisson: toNumber(get("poisson")),
      linear: toNumber(get("linear")),
      nonlinear: toNumber(get("nonlinear")),
      ensemble,
      actual,
      dkConfidence: toText(get("dkConfidence")),
      fdConfidence: toText(get("fdConfidence")),
      vix: toNumber(get("vix")),
    });
  }
  if (!games.length) throw new Error("No usable PitchIQ game rows found in the export.");
  return games;
}
