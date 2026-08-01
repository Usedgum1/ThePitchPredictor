/** @param {number} n */
export function fmtInt(n) {
  return Math.round(n).toLocaleString("en-US");
}

/** @param {number} rate 0-1 */
export function fmtPct(rate) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Win-rate / hit-rate color bucket.
 * @param {number | null | undefined} rate 0-1
 * @param {"win"|"hit"} [scale]
 * @returns {"good"|"mid"|"bad"}
 */
export function pctTone(rate, scale = "win") {
  if (rate == null || !Number.isFinite(rate)) return "mid";
  if (scale === "hit") {
    if (rate >= 0.45) return "good";
    if (rate >= 0.35) return "mid";
    return "bad";
  }
  if (rate >= 0.55) return "good";
  if (rate >= 0.5) return "mid";
  return "bad";
}

/** @param {number | null | undefined} n */
export function fmtNum(n, digits = 3) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** @param {Date | null | undefined} d */
export function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** @param {import("../analytics/engine.js").WinLoss | null | undefined} stats */
export function fmtRecord(stats) {
  if (!stats || !stats.total) return "—";
  return `${stats.wins}W-${stats.losses}L`;
}
