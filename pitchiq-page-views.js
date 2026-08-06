(function (global) {
  const SESSION_KEY = "pitchiq_pv_sid";
  const DEDUPE_PREFIX = "pitchiq_pv_seen:";
  const DEDUPE_MS = 30 * 60 * 1000;

  function sessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = global.crypto?.randomUUID?.() || `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return null;
    }
  }

  function shouldSkipPath(path) {
    const normalized = String(path || "").toLowerCase();
    return (
      normalized.startsWith("/owners") ||
      normalized.includes("/owners/") ||
      normalized.includes("demo") ||
      normalized.includes("card-workshop")
    );
  }

  function recentlyTracked(path) {
    try {
      const key = `${DEDUPE_PREFIX}${path}`;
      const raw = sessionStorage.getItem(key);
      const last = raw ? Number(raw) : 0;
      if (last && Date.now() - last < DEDUPE_MS) return true;
      sessionStorage.setItem(key, String(Date.now()));
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fire-and-forget page view insert. Safe to call on every page load.
   * @param {import("@supabase/supabase-js").SupabaseClient} client
   */
  async function track(client) {
    try {
      if (!client?.from) return;
      const path = String(global.location?.pathname || "/").slice(0, 500);
      if (shouldSkipPath(path)) return;
      if (recentlyTracked(path)) return;

      let userId = null;
      try {
        const { data } = await client.auth.getSession();
        userId = data?.session?.user?.id || null;
      } catch {
        userId = null;
      }

      const referrer = String(global.document?.referrer || "").trim().slice(0, 500) || null;
      await client.from("pitchiq_page_views").insert({
        path,
        session_id: sessionId(),
        user_id: userId,
        referrer,
      });
    } catch {
      // Tracking must never break the app.
    }
  }

  global.PitchIQPageViews = { track };
})(window);
