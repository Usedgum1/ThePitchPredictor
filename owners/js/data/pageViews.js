/**
 * Page-view analytics for Owners → Customers.
 * Reads from public.pitchiq_page_views (owner SELECT / public INSERT).
 */

/** @typedef {"daily"|"weekly"|"monthly"|"yearly"} PageViewPeriod */

/**
 * @typedef {{
 *   today: number,
 *   last7: number,
 *   last30: number,
 *   uniqueSessions7: number,
 *   uniqueSessions30: number,
 *   signedInViews30: number,
 *   daily: { day: string, label: string, views: number, sessions: number }[],
 *   trends: Record<PageViewPeriod, { key: string, label: string, views: number, sessions: number }[]>,
 *   topPaths: { path: string, views: number, share: number }[],
 * }} PageViewAnalytics
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {number} [days]
 * @returns {Promise<{ rows: object[], error: string | null }>}
 */
export async function fetchPageViews(client, days = 365) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("pitchiq_page_views")
    .select("occurred_at, path, session_id, user_id")
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50000);

  if (error) {
    return { rows: [], error: error.message || "Failed to load page views." };
  }
  return { rows: data || [], error: null };
}

/**
 * @param {Date} date
 * @param {PageViewPeriod} period
 */
function periodKey(date, period) {
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
    const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, "0")}`;
  }
  return `${y}-${m}`;
}

/**
 * @param {string} key
 * @param {PageViewPeriod} period
 */
function periodLabel(key, period) {
  if (period === "daily") {
    const parts = String(key).split("-");
    if (parts.length !== 3) return key;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }
  if (period === "monthly") {
    const parts = String(key).split("-");
    if (parts.length !== 2) return key;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[Number(parts[1]) - 1] || parts[1];
    return `${month} ${parts[0]}`;
  }
  if (period === "weekly") return key;
  return key;
}

/**
 * @param {object[]} rows
 * @param {PageViewPeriod} period
 * @param {number} lookbackDays
 */
function buildTrend(rows, period, lookbackDays) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - lookbackDays);

  /** @type {Map<string, { views: number, sessions: Set<string> }>} */
  const buckets = new Map();

  for (const row of rows) {
    const at = row?.occurred_at ? new Date(row.occurred_at) : null;
    if (!at || Number.isNaN(at.getTime()) || at < start) continue;
    const key = periodKey(at, period);
    if (!key) continue;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { views: 0, sessions: new Set() };
      buckets.set(key, bucket);
    }
    bucket.views += 1;
    const session = String(row.session_id || "").trim();
    if (session) bucket.sessions.add(session);
  }

  // Fill continuous daily range so the chart doesn't skip quiet days.
  if (period === "daily") {
    for (let i = lookbackDays; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = periodKey(d, "daily");
      if (!buckets.has(key)) buckets.set(key, { views: 0, sessions: new Set() });
    }
  }

  return [...buckets.keys()]
    .sort()
    .map((key) => {
      const bucket = buckets.get(key);
      return {
        key,
        label: periodLabel(key, period),
        views: bucket?.views || 0,
        sessions: bucket?.sessions.size || 0,
      };
    });
}

/**
 * @param {object[]} rows
 * @returns {PageViewAnalytics}
 */
export function analyzePageViews(rows) {
  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const ms7 = 7 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;

  let today = 0;
  let last7 = 0;
  let last30 = 0;
  let signedInViews30 = 0;
  /** @type {Set<string>} */
  const sessions7 = new Set();
  /** @type {Set<string>} */
  const sessions30 = new Set();
  /** @type {Map<string, number>} */
  const byPath = new Map();

  for (const row of rows) {
    const at = row?.occurred_at ? new Date(row.occurred_at).getTime() : NaN;
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    const path = String(row.path || "/").trim() || "/";
    const session = String(row.session_id || "").trim();

    if (at >= startToday.getTime()) today += 1;
    if (age <= ms7) {
      last7 += 1;
      if (session) sessions7.add(session);
    }
    if (age <= ms30) {
      last30 += 1;
      if (session) sessions30.add(session);
      if (row.user_id) signedInViews30 += 1;
      byPath.set(path, (byPath.get(path) || 0) + 1);
    }
  }

  const daily = buildTrend(rows, "daily", 29);
  const trends = {
    daily: buildTrend(rows, "daily", 89),
    weekly: buildTrend(rows, "weekly", 179),
    monthly: buildTrend(rows, "monthly", 364),
    yearly: buildTrend(rows, "yearly", 364 * 3),
  };

  const topPaths = [...byPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([path, views]) => ({
      path,
      views,
      share: last30 ? views / last30 : 0,
    }));

  return {
    today,
    last7,
    last30,
    uniqueSessions7: sessions7.size,
    uniqueSessions30: sessions30.size,
    signedInViews30,
    daily,
    trends,
    topPaths,
  };
}
