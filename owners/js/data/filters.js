/**
 * @typedef {{ start: string, end: string }} FilterState
 */

/** @returns {FilterState} */
export function createDefaultFilters() {
  return { start: "", end: "" };
}

/** @param {string} value @param {boolean} endOfDay */
function dateInputToTime(value, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const parsed = Date.parse(`${value}${suffix}`);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * @param {import("./games.js").GameRow[]} games
 * @param {FilterState} filters
 */
export function filterGames(games, filters) {
  const start = dateInputToTime(filters.start, false);
  const end = dateInputToTime(filters.end, true);
  return games.filter((game) => {
    if (!game.date) return !start && !end;
    const t = game.date.getTime();
    if (start != null && t < start) return false;
    if (end != null && t > end) return false;
    return true;
  });
}

/** @param {FilterState} filters */
export function hasDataFilter(filters) {
  return Boolean(filters?.start || filters?.end);
}

/**
 * Short label for active date filter (empty when no filter).
 * @param {FilterState} filters
 */
export function formatDataFilterLabel(filters) {
  if (!hasDataFilter(filters)) return "";
  const fmt = (iso) => {
    if (!iso) return "";
    const parsed = Date.parse(`${iso}T12:00:00`);
    if (Number.isNaN(parsed)) return iso;
    return new Date(parsed).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  if (filters.start && filters.end) return `${fmt(filters.start)} → ${fmt(filters.end)}`;
  if (filters.start) return `From ${fmt(filters.start)}`;
  return `Through ${fmt(filters.end)}`;
}
