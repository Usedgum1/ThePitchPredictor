import {
  HISTORICAL_PAGE_SIZE,
  HISTORICAL_TABLE,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "./config.js";

/**
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createSupabaseClient() {
  if (!window.supabase?.createClient) {
    throw new Error("Supabase library failed to load.");
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });
}

/**
 * Page through every historical row (website UI caps at 2000; analytics wants the full set).
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {(loaded: number) => void} [onProgress]
 */
export async function fetchHistoricalPayloads(client, onProgress) {
  /** @type {object[]} */
  const payloads = [];
  let from = 0;

  while (true) {
    const to = from + HISTORICAL_PAGE_SIZE - 1;
    const { data, error } = await client
      .from(HISTORICAL_TABLE)
      .select("event_key,pitcher,game_date,payload,updated_at")
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load pitchiq_historical_rows.");
    }
    if (!data?.length) break;

    for (const row of data) {
      if (!row?.payload || typeof row.payload !== "object") continue;
      payloads.push({
        ...row.payload,
        event_key: row.payload.event_key || row.event_key || "",
        pitcher: row.payload.pitcher || row.pitcher || "",
        game_date: row.payload.game_date || row.payload.date || row.game_date || "",
      });
    }

    onProgress?.(payloads.length);
    if (data.length < HISTORICAL_PAGE_SIZE) break;
    from += HISTORICAL_PAGE_SIZE;
  }

  return payloads;
}
