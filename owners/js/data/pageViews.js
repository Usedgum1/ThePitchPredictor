/**
 * Page-view analytics for Owners → Customers.
 * Reads from public.pitchiq_page_views (owner SELECT / public INSERT).
 */

/**
 * @typedef {{
 *   today: number,
 *   last7: number,
 *   last30: number,
 *   uniqueSessions7: number,
 *   uniqueSessions30: number,
 *   signedInViews30: number,
 *   daily: { day: string, views: number, sessions: number }[],
 *   topPaths: { path: string, views: number, share: number }[],
 * }} PageViewAnalytics
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {number} [days]
 * @returns {Promise<{ rows: object[], error: string | null }>}
 */
export async function fetchPageViews(client, days = 30) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("pitchiq_page_views")
    .select("occurred_at, path, session_id, user_id")
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(20000);

  if (error) {
    return { rows: [], error: error.message || "Failed to load page views." };
  }
  return { rows: data || [], error: null };
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
  /** @type {Map<string, { views: number, sessions: Set<string> }>} */
  const byDay = new Map();
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

      const day = new Date(at);
      const key = [
        day.getFullYear(),
        String(day.getMonth() + 1).padStart(2, "0"),
        String(day.getDate()).padStart(2, "0"),
      ].join("-");
      let bucket = byDay.get(key);
      if (!bucket) {
        bucket = { views: 0, sessions: new Set() };
        byDay.set(key, bucket);
      }
      bucket.views += 1;
      if (session) bucket.sessions.add(session);
    }
  }

  const daily = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const bucket = byDay.get(key);
    daily.push({
      day: key,
      views: bucket?.views || 0,
      sessions: bucket?.sessions.size || 0,
    });
  }

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
    topPaths,
  };
}
