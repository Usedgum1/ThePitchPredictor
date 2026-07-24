/**
 * PitchIQ Terms of Service — version + acceptance recording helpers.
 *
 * When you publish new Terms, bump CURRENT.version (e.g. v1 → v2) and update
 * lastUpdated / shownVersion to match the document shown in login.html.
 */
(function (global) {
  const CURRENT = {
    version: "v1",
    lastUpdated: "2026-07-23",
    /** Exact label shown / logged as the terms version presented to the user. */
    shownVersion: "PitchIQ Terms of Service | Version v1 | Last Updated: July 23, 2026",
  };

  function buildAcceptancePayload(acceptedAtIso) {
    return {
      termsVersion: CURRENT.version,
      termsShownVersion: CURRENT.shownVersion,
      acceptedAt: acceptedAtIso || new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };
  }

  function toSignupMetadata(acceptance) {
    if (!acceptance) return {};
    return {
      terms_version: acceptance.termsVersion,
      terms_shown_version: acceptance.termsShownVersion,
      terms_accepted_at: acceptance.acceptedAt,
      terms_user_agent: acceptance.userAgent,
    };
  }

  function acceptanceFromUserMetadata(user) {
    const meta = user?.user_metadata || {};
    const termsVersion = String(meta.terms_version || "").trim();
    const termsShownVersion = String(meta.terms_shown_version || "").trim();
    const acceptedAt = String(meta.terms_accepted_at || "").trim();
    if (!termsVersion || !termsShownVersion || !acceptedAt) {
      return null;
    }
    return {
      termsVersion,
      termsShownVersion,
      acceptedAt,
      userAgent: String(meta.terms_user_agent || navigator.userAgent || ""),
    };
  }

  async function recordAcceptance(
    supabaseClient,
    supabaseUrl,
    publishableKey,
    acceptance,
  ) {
    if (!acceptance?.termsVersion || !acceptance?.acceptedAt) {
      throw new Error("Missing terms acceptance payload.");
    }

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData.session) {
      throw new Error("You must be signed in to record terms acceptance.");
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/record-terms-acceptance`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
        apikey: publishableKey,
      },
      body: JSON.stringify({
        termsVersion: acceptance.termsVersion,
        termsShownVersion: acceptance.termsShownVersion,
        acceptedAt: acceptance.acceptedAt,
        userAgent: acceptance.userAgent,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to record terms acceptance.");
    }
    return payload;
  }

  /**
   * Records acceptance when a session exists. Prefer the in-memory payload from
   * the Create Account flow; otherwise fall back to auth user_metadata.
   * Soft-fails (returns { ok:false }) so signup/login are never blocked.
   */
  async function ensureRecorded(
    supabaseClient,
    supabaseUrl,
    publishableKey,
    acceptance,
  ) {
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData?.session?.user) {
        return { ok: false, skipped: true, reason: "no_session" };
      }

      // Prefer fresh server user metadata (important after email confirm).
      let user = sessionData.session.user;
      try {
        const { data: userData } = await supabaseClient.auth.getUser();
        if (userData?.user) user = userData.user;
      } catch {
        // Keep session user as fallback.
      }

      const payload =
        acceptance
        || acceptanceFromUserMetadata(user);

      if (!payload) {
        return { ok: false, skipped: true, reason: "no_acceptance_payload" };
      }

      const result = await recordAcceptance(
        supabaseClient,
        supabaseUrl,
        publishableKey,
        payload,
      );
      return { ok: true, result };
    } catch (error) {
      console.warn("PitchIQ terms acceptance recording failed:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  global.PitchIQTerms = {
    CURRENT,
    buildAcceptancePayload,
    toSignupMetadata,
    acceptanceFromUserMetadata,
    recordAcceptance,
    ensureRecorded,
  };
})(window);
