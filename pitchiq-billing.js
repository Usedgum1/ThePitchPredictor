(function (global) {
  const PROFILE_SELECT =
    "role, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status, subscription_current_period_end";

  const PAID_ROLES = new Set(["basic", "pro"]);
  const EXEMPT_ROLES = new Set(["life", "admin", "owner"]);

  function hasStripeBillingLink(profile) {
    return Boolean(profile?.stripe_customer_id || profile?.stripe_subscription_id);
  }

  function hasActiveMembership(profile) {
    if (!profile) return false;

    const role = String(profile.role || "").toLowerCase();
    if (EXEMPT_ROLES.has(role)) return true;
    if (!PAID_ROLES.has(role)) return false;

    const hasSubscription = Boolean(profile.stripe_subscription_id);
    const hasStripeCustomer = Boolean(profile.stripe_customer_id);
    const status = String(profile.subscription_status || "").toLowerCase();
    const inPaidPeriod = profile.subscription_current_period_end
      ? new Date(profile.subscription_current_period_end).getTime() > Date.now()
      : false;

    if (status === "active" || status === "trialing") {
      // Partial Stripe sync (customer/status without subscription id) is not active access.
      if ((hasStripeCustomer || hasSubscription) && !hasSubscription) return false;
      return true;
    }

    if (inPaidPeriod) {
      if ((hasStripeCustomer || hasSubscription) && !hasSubscription) return false;
      return true;
    }

    // Manual or grandfathered accounts without any Stripe metadata.
    if (!hasStripeBillingLink(profile)) return true;

    return false;
  }

  async function fetchBillingProfile(supabaseClient, userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("user_id", userId)
      .single();

    if (error) {
      return { profile: null, error };
    }

    return { profile: data, error: null };
  }

  async function callBillingFunction(
    supabaseClient,
    supabaseUrl,
    publishableKey,
    functionName,
    body,
  ) {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !sessionData.session) {
      throw new Error("You must be signed in to manage billing.");
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        "Content-Type": "application/json",
        apikey: publishableKey,
      },
      body: JSON.stringify(body || {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Billing request failed.");
    }

    return payload;
  }

  async function startCheckout(supabaseClient, supabaseUrl, publishableKey, priceTier) {
    global.PitchIQFeatureLocks?.assertStripeAllowed("checkout");

    const payload = await callBillingFunction(
      supabaseClient,
      supabaseUrl,
      publishableKey,
      "create-checkout-session",
      { priceTier },
    );

    if (!payload.url) {
      throw new Error("Checkout URL was not returned.");
    }

    window.location.href = payload.url;
  }

  async function openBillingPortal(
    supabaseClient,
    supabaseUrl,
    publishableKey,
    options,
  ) {
    global.PitchIQFeatureLocks?.assertStripeAllowed("portal");

    const flow = options && options.flow ? options.flow : undefined;
    const payload = await callBillingFunction(
      supabaseClient,
      supabaseUrl,
      publishableKey,
      "create-portal-session",
      flow ? { flow } : {},
    );

    if (!payload.url) {
      throw new Error("Billing portal URL was not returned.");
    }

    window.location.href = payload.url;
  }

  async function changeSubscription(
    supabaseClient,
    supabaseUrl,
    publishableKey,
    priceTier,
  ) {
    const tier = String(priceTier || "").toLowerCase();
    global.PitchIQFeatureLocks?.assertStripeAllowed(tier === "pro" ? "upgrade" : "downgrade");

    return callBillingFunction(
      supabaseClient,
      supabaseUrl,
      publishableKey,
      "change-subscription",
      { priceTier },
    );
  }

  async function confirmCheckoutSession(supabaseClient, supabaseUrl, publishableKey, sessionId) {
    return callBillingFunction(
      supabaseClient,
      supabaseUrl,
      publishableKey,
      "confirm-checkout-session",
      { sessionId },
    );
  }

  global.PitchIQBilling = {
    PROFILE_SELECT,
    hasStripeBillingLink,
    hasActiveMembership,
    fetchBillingProfile,
    startCheckout,
    openBillingPortal,
    changeSubscription,
    confirmCheckoutSession,
  };
})(window);
