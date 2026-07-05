/**
 * PitchIQ feature locks — temporary gates for Stripe / purchasing flows.
 *
 * UNLOCK FOR PRODUCTION:
 *   1. Set MASTER_LOCK = false below, OR
 *   2. Flip individual entries in LOCKED to false.
 *
 * CURRENTLY LOCKED (web deploy without live Stripe purchasing):
 *   - createAccount       login.html — "Create Account" button
 *   - initialCheckout     subscribe.html — "Subscribe to Basic/Pro"; account-settings "Choose a plan"
 *   - membershipUpgrade   account-settings.html — "Upgrade to Pro"
 *   - membershipDowngrade account-settings.html — "Downgrade to Basic"
 *   - billingPortal       account-settings.html — "Payment & invoices", "Cancel subscription"
 *
 * NOT LOCKED (still available):
 *   - login.html — sign in, forgot password
 *   - subscribe.html — post-checkout success handling (returning from Stripe)
 */
(function (global) {
  const MASTER_LOCK = true;

  const LOCKED = {
    createAccount: true,
    initialCheckout: true,
    membershipUpgrade: true,
    membershipDowngrade: true,
    billingPortal: true,
  };

  const STRIPE_FEATURES = [
    "initialCheckout",
    "membershipUpgrade",
    "membershipDowngrade",
    "billingPortal",
  ];

  const MESSAGES = {
    createAccount:
      "New account signup is temporarily paused while we finish payment setup. Existing members can still sign in.",
    initialCheckout:
      "New subscriptions are temporarily paused while we finish payment setup.",
    membershipUpgrade:
      "Upgrades are temporarily paused while we finish payment setup.",
    membershipDowngrade:
      "Downgrades are temporarily paused while we finish payment setup.",
    billingPortal:
      "Billing management is temporarily paused while we finish payment setup.",
    default: "This action is temporarily unavailable. Please check back soon.",
  };

  function isLocked(feature) {
    if (!MASTER_LOCK) return false;
    return Boolean(LOCKED[feature]);
  }

  function isStripeLocked() {
    return STRIPE_FEATURES.some((feature) => isLocked(feature));
  }

  function lockMessage(feature) {
    return MESSAGES[feature] || MESSAGES.default;
  }

  function applyButtonLock(button, feature) {
    if (!button || !isLocked(feature)) return false;

    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
    button.title = lockMessage(feature);
    return true;
  }

  function assertStripeAllowed(action) {
    const featureByAction = {
      checkout: "initialCheckout",
      portal: "billingPortal",
      upgrade: "membershipUpgrade",
      downgrade: "membershipDowngrade",
    };
    const feature = featureByAction[action];
    if (feature && isLocked(feature)) {
      throw new Error(lockMessage(feature));
    }
  }

  function listLocked() {
    if (!MASTER_LOCK) return [];
    return Object.keys(LOCKED).filter((feature) => LOCKED[feature]);
  }

  global.PitchIQFeatureLocks = {
    MASTER_LOCK,
    LOCKED,
    STRIPE_FEATURES,
    MESSAGES,
    isLocked,
    isStripeLocked,
    lockMessage,
    applyButtonLock,
    assertStripeAllowed,
    listLocked,
  };
})(window);
