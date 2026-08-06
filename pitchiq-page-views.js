(function (global) {
  const SESSION_KEY = "pitchiq_pv_sid";
  const DEDUPE_PREFIX = "pitchiq_pv_seen:";
  const LAST_ANY_KEY = "pitchiq_pv_last_any";
  const DEDUPE_MS = 30 * 60 * 1000;
  const BOUNCE_MS = 400;
  const ANY_PATH_DEBOUNCE_MS = 2500;

  /** @type {Promise<void> | null} */
  let inFlight = null;

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

      const lastAny = Number(sessionStorage.getItem(LAST_ANY_KEY) || 0);
      if (lastAny && Date.now() - lastAny < ANY_PATH_DEBOUNCE_MS) return true;

      return false;
    } catch {
      return false;
    }
  }

  function markTracked(path) {
    try {
      sessionStorage.setItem(`${DEDUPE_PREFIX}${path}`, String(Date.now()));
      sessionStorage.setItem(LAST_ANY_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  function waitForSettle() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (bounced) => {
        if (done) return;
        done = true;
        global.removeEventListener("pagehide", onAway);
        global.removeEventListener("beforeunload", onAway);
        resolve(bounced);
      };
      const onAway = () => finish(true);
      global.addEventListener("pagehide", onAway);
      global.addEventListener("beforeunload", onAway);
      global.setTimeout(() => finish(false), BOUNCE_MS);
    });
  }

  /**
   * Fire-and-forget page view insert. Safe to call on every page load.
   * Skips redirect bounces (e.g. app.html → app-mobile.html) so one visit ≠ two rows.
   * @param {import("@supabase/supabase-js").SupabaseClient} client
   */
  async function track(client) {
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        if (!client?.from) return;
        if (global.__pitchiqSkipPageView) return;

        const path = String(global.location?.pathname || "/").slice(0, 500);
        if (shouldSkipPath(path)) return;
        if (recentlyTracked(path)) return;

        // Head redirects can still let bottom scripts run; wait briefly and abort on unload.
        const bounced = await waitForSettle();
        if (bounced || global.__pitchiqSkipPageView) return;
        if (recentlyTracked(path)) return;

        let userId = null;
        try {
          const { data } = await client.auth.getSession();
          userId = data?.session?.user?.id || null;
        } catch {
          userId = null;
        }

        // Owner accounts are internal — don't inflate public traffic stats.
        if (userId) {
          try {
            const { data: profile } = await client
              .from("profiles")
              .select("role")
              .eq("user_id", userId)
              .maybeSingle();
            if (String(profile?.role || "").trim().toLowerCase() === "owner") return;
          } catch {
            // If role lookup fails, still record the view.
          }
        }

        if (global.__pitchiqSkipPageView) return;

        const referrer = String(global.document?.referrer || "").trim().slice(0, 500) || null;
        const { error } = await client.from("pitchiq_page_views").insert({
          path,
          session_id: sessionId(),
          user_id: userId,
          referrer,
        });
        if (!error) markTracked(path);
      } catch {
        // Tracking must never break the app.
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  }

  global.PitchIQPageViews = { track };
})(window);
