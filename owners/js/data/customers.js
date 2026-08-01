import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

/** Plan list prices used for estimated MRR (Stripe is source of truth for invoices). */
export const PLAN_MRR = {
  basic: 5,
  pro: 10,
  life: 0,
  admin: 0,
  owner: 0,
};

/**
 * Internal / complimentary accounts — never counted in paying seats or estimated MRR.
 * Keep lowercase.
 */
export const STAFF_EMAILS = new Set([
  "davis4874@gmail.com",
  "stoweaway1992@aol.com",
  "saravananjothi@gmail.com",
  "johnson_a2@yahoo.com",
  "tstowe0@gmail.com",
]);

/** @param {{ email?: string | null }} user */
export function isStaffUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return Boolean(email) && STAFF_EMAILS.has(email);
}

/**
 * @typedef {{
 *   id: string,
 *   email: string | null,
 *   username: string | null,
 *   created_at: string | null,
 *   email_confirmed_at: string | null,
 *   last_sign_in_at: string | null,
 *   banned_until: string | null,
 *   is_banned: boolean,
 *   role: string | null,
 *   subscription_status: string | null,
 *   subscription_current_period_end: string | null,
 *   stripe_customer_id: string | null,
 *   stripe_subscription_id: string | null,
 *   terms: object | null,
 * }} OwnerUser
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {object} body
 */
async function callOwnerUserApi(client, body) {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in to load customers.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/owner-user-lookup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.msg || "Owner customer request failed.");
  }
  return payload;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @returns {Promise<OwnerUser[]>}
 */
export async function fetchOwnerUsers(client) {
  const payload = await callOwnerUserApi(client, { action: "list", query: "", limit: 1000 });
  return Array.isArray(payload.users) ? payload.users : [];
}

/**
 * Owner edge-function mutations (service-role bypass behind owner JWT).
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} userId
 * @param {string | null} role  basic|pro|life|admin|owner|null (empty clears)
 */
export async function setOwnerUserRole(client, userId, role) {
  return callOwnerUserApi(client, { action: "set_role", userId, role: role ?? "" });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} userId
 * @param {boolean} banned
 */
export async function setOwnerUserBanned(client, userId, banned) {
  return callOwnerUserApi(client, { action: banned ? "ban" : "unban", userId });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} userId
 */
export async function deleteOwnerUser(client, userId) {
  return callOwnerUserApi(client, { action: "delete", userId });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} userId
 */
export async function resendOwnerUserConfirmation(client, userId) {
  return callOwnerUserApi(client, { action: "resend_confirmation", userId });
}

/**
 * Owner broadcast email via Resend (owner-send-email edge function).
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ subject: string, body: string, userIds?: string[], all?: boolean }} options
 */
export async function sendOwnerBroadcastEmail(client, options) {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error("You must be signed in to send email.");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/owner-send-email`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({
      subject: options.subject,
      body: options.body,
      userIds: options.userIds || [],
      all: Boolean(options.all),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.msg || "Failed to send email.");
  }
  return payload;
}

/** @param {string | null | undefined} stripeCustomerId */
export function stripeCustomerSearchUrl(stripeCustomerId) {
  const id = String(stripeCustomerId || "").trim();
  if (!id) return null;
  return `https://dashboard.stripe.com/search?query=${encodeURIComponent(id)}`;
}

/**
 * @typedef {{
 *   id: string,
 *   customerId: string,
 *   status: string,
 *   created: number,
 *   canceledAt: number | null,
 *   endedAt: number | null,
 *   priceTier: string | null,
 * }} StripeSubInterval
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @returns {Promise<StripeSubInterval[]>}
 */
export async function fetchSubscriptionHistory(client) {
  const payload = await callOwnerUserApi(client, { action: "subscription_history" });
  return Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
}

/**
 * Active Stripe subscription count at each period end (daily / weekly / monthly).
 * @param {StripeSubInterval[]} subscriptions
 * @param {Set<string>} excludeCustomerIds
 * @param {"daily"|"weekly"|"monthly"} period
 */
export function buildActiveSubSeries(subscriptions, excludeCustomerIds, period = "monthly") {
  const filtered = subscriptions.filter((s) => s.customerId && !excludeCustomerIds.has(s.customerId));
  if (!filtered.length) return [];

  const starts = filtered.map((s) => s.created * 1000);
  const minTs = Math.min(...starts);
  const now = Date.now();

  /** @param {Date} d */
  function bucketKey(d) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    if (period === "daily") return `${y}-${m}-${day}`;
    if (period === "weekly") {
      const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const isoYear = tmp.getUTCFullYear();
      const yearStart = new Date(Date.UTC(isoYear, 0, 1));
      const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
    }
    return `${y}-${m}`;
  }

  /** @param {string} key */
  function endOfBucket(key) {
    if (period === "daily") {
      const [y, m, d] = key.split("-").map(Number);
      return Date.UTC(y, m - 1, d, 23, 59, 59, 999);
    }
    if (period === "weekly") {
      const [ys, ws] = key.split("-W");
      const y = Number(ys);
      const w = Number(ws);
      const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
      const dow = simple.getUTCDay();
      const ISOweekStart = simple;
      if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
      else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
      const end = new Date(ISOweekStart);
      end.setUTCDate(end.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);
      return end.getTime();
    }
    const [y, m] = key.split("-").map(Number);
    return Date.UTC(y, m, 0, 23, 59, 59, 999);
  }

  /** @type {Set<string>} */
  const keys = new Set();
  const cursor = new Date(minTs);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);

  if (period === "monthly") {
    cursor.setUTCDate(1);
    while (cursor.getTime() <= end.getTime()) {
      keys.add(bucketKey(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else if (period === "weekly") {
    while (cursor.getTime() <= end.getTime()) {
      keys.add(bucketKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else {
    // daily — cap to last 180 days for readability
    const dailyStart = Math.max(minTs, now - 180 * 86400000);
    cursor.setTime(dailyStart);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor.getTime() <= end.getTime()) {
      keys.add(bucketKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const sortedKeys = [...keys].sort();
  return sortedKeys.map((key) => {
    const at = Math.min(endOfBucket(key), now);
    let active = 0;
    let basic = 0;
    let pro = 0;
    for (const sub of filtered) {
      const start = sub.created * 1000;
      const stopCandidates = [sub.canceledAt, sub.endedAt].filter((v) => v != null).map((v) => /** @type {number} */ (v) * 1000);
      const stop = stopCandidates.length ? Math.min(...stopCandidates) : null;
      if (start <= at && (stop == null || stop > at)) {
        active += 1;
        if (sub.priceTier === "basic") basic += 1;
        else if (sub.priceTier === "pro") pro += 1;
      }
    }
    return { label: key, active, basic, pro };
  });
}

/** @param {string | null | undefined} value */
function roleKey(value) {
  const role = String(value || "").trim().toLowerCase();
  return role || "none";
}

/** @param {string | null | undefined} value */
function statusKey(value) {
  const status = String(value || "").trim().toLowerCase();
  return status || "none";
}

/** @param {string | null | undefined} iso */
function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @param {Date} date */
function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * @param {OwnerUser[]} users
 * @param {StripeSubInterval[]} [subscriptions]
 * @param {"daily"|"weekly"|"monthly"} [fluxPeriod]
 */
export function analyzeCustomers(users, subscriptions = [], fluxPeriod = "monthly") {
  const excludeCustomerIds = new Set(
    users.filter(isStaffUser).map((u) => u.stripe_customer_id).filter(Boolean)
  );
  const activeSubSeries = buildActiveSubSeries(subscriptions, excludeCustomerIds, fluxPeriod);
  const now = Date.now();
  const day = 86400000;
  const in7 = now - 7 * day;
  const in30 = now - 30 * day;
  const in90 = now - 90 * day;
  const soon = now + 14 * day;

  /** @type {Record<string, number>} */
  const byRole = {};
  /** @type {Record<string, number>} */
  const byStatus = {};
  /** @type {Map<string, number>} */
  const signupsByMonth = new Map();

  let confirmed = 0;
  let banned = 0;
  let withStripe = 0;
  let withSub = 0;
  let termsAccepted = 0;
  let signedIn7 = 0;
  let signedIn30 = 0;
  let signedIn90 = 0;
  let neverSignedIn = 0;
  let periodEndingSoon = 0;
  let staff = 0;

  for (const user of users) {
    const staffMember = isStaffUser(user);
    if (staffMember) staff += 1;

    const role = staffMember ? "staff" : roleKey(user.role);
    const status = statusKey(user.subscription_status);
    byRole[role] = (byRole[role] || 0) + 1;
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (user.email_confirmed_at) confirmed += 1;
    if (user.is_banned) banned += 1;
    if (user.stripe_customer_id) withStripe += 1;
    if (user.stripe_subscription_id) withSub += 1;
    if (user.terms) termsAccepted += 1;

    const created = parseDate(user.created_at);
    if (created) {
      const key = monthKey(created);
      signupsByMonth.set(key, (signupsByMonth.get(key) || 0) + 1);
    }

    const last = parseDate(user.last_sign_in_at);
    if (!last) neverSignedIn += 1;
    else {
      const t = last.getTime();
      if (t >= in7) signedIn7 += 1;
      if (t >= in30) signedIn30 += 1;
      if (t >= in90) signedIn90 += 1;
    }

    if (staffMember) continue;

    const periodEnd = parseDate(user.subscription_current_period_end);
    if (
      periodEnd &&
      periodEnd.getTime() >= now &&
      periodEnd.getTime() <= soon &&
      ["active", "trialing", "past_due"].includes(status)
    ) {
      periodEndingSoon += 1;
    }
  }

  /** @type {{ email: string, role: string, status: string, mrr: number, stripe_subscription_id: string | null }[]} */
  const revenueSeats = [];
  let estimatedMrr = 0;
  let paying = 0;
  // Match Stripe MRR: paid plan + active sub only (no trial / past_due / role-only comps).
  for (const user of users) {
    if (isStaffUser(user)) continue;
    const role = roleKey(user.role);
    const status = statusKey(user.subscription_status);
    if (role !== "basic" && role !== "pro") continue;
    if (status !== "active") continue;
    if (!user.stripe_subscription_id) continue;
    const amount = PLAN_MRR[role] || 0;
    if (!amount) continue;
    estimatedMrr += amount;
    paying += 1;
    revenueSeats.push({
      email: user.email || user.username || user.id.slice(0, 8),
      role,
      status,
      mrr: amount,
      stripe_subscription_id: user.stripe_subscription_id,
    });
  }
  revenueSeats.sort((a, b) => b.mrr - a.mrr || String(a.email).localeCompare(String(b.email)));

  const roleOrder = ["basic", "pro", "life", "admin", "owner", "staff", "none"];
  const statusOrder = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "none"];

  const roles = roleOrder
    .filter((k) => byRole[k])
    .concat(Object.keys(byRole).filter((k) => !roleOrder.includes(k)))
    .map((role) => ({
      role,
      count: byRole[role] || 0,
      share: users.length ? (byRole[role] || 0) / users.length : 0,
    }));

  const statuses = statusOrder
    .filter((k) => byStatus[k])
    .concat(Object.keys(byStatus).filter((k) => !statusOrder.includes(k)))
    .map((status) => ({
      status,
      count: byStatus[status] || 0,
      share: users.length ? (byStatus[status] || 0) / users.length : 0,
    }));

  const monthlySignups = [...signupsByMonth.keys()]
    .sort()
    .map((month) => ({ month, signups: signupsByMonth.get(month) || 0 }));

  /** @param {OwnerUser} u */
  const displayRole = (u) => (isStaffUser(u) ? "staff" : u.role || "—");

  const recent = [...users]
    .sort((a, b) => {
      const at = parseDate(a.created_at)?.getTime() || 0;
      const bt = parseDate(b.created_at)?.getTime() || 0;
      return bt - at;
    })
    .slice(0, 25);

  const endingSoon = users
    .filter((u) => {
      if (isStaffUser(u)) return false;
      const periodEnd = parseDate(u.subscription_current_period_end);
      const status = statusKey(u.subscription_status);
      return (
        periodEnd &&
        periodEnd.getTime() >= now &&
        periodEnd.getTime() <= soon &&
        ["active", "trialing", "past_due"].includes(status)
      );
    })
    .sort((a, b) => {
      const at = parseDate(a.subscription_current_period_end)?.getTime() || 0;
      const bt = parseDate(b.subscription_current_period_end)?.getTime() || 0;
      return at - bt;
    })
    .slice(0, 15);

  const staffUsers = users.filter(isStaffUser);

  /** Mutually exclusive population buckets (sum = total accounts). */
  /** @type {Record<string, number>} */
  const popCounts = {};
  /** @type {Record<string, number>} */
  const subbedByPlan = { basic: 0, pro: 0 };

  for (const user of users) {
    const role = roleKey(user.role);
    const status = statusKey(user.subscription_status);
    let bucket = "unknown";

    if (isStaffUser(user)) bucket = "Staff";
    else if (role === "owner") bucket = "Owner";
    else if (role === "admin") bucket = "Admin";
    else if (role === "life") bucket = "Life";
    else if (role === "basic" && status === "active" && user.stripe_subscription_id) {
      bucket = "Basic · active";
      subbedByPlan.basic += 1;
    } else if (role === "pro" && status === "active" && user.stripe_subscription_id) {
      bucket = "Pro · active";
      subbedByPlan.pro += 1;
    } else if ((role === "basic" || role === "pro") && status === "trialing") {
      bucket = "Trialing";
    } else if ((role === "basic" || role === "pro") && status === "past_due") {
      bucket = "Past due";
    } else if (status === "canceled") {
      bucket = "Canceled";
    } else if (role === "basic") {
      bucket = "Basic · other";
    } else if (role === "pro") {
      bucket = "Pro · other";
    } else if (role === "none") {
      bucket = "No plan";
    } else {
      bucket = role;
    }

    popCounts[bucket] = (popCounts[bucket] || 0) + 1;
  }

  const popOrder = [
    "Basic · active",
    "Pro · active",
    "Trialing",
    "Past due",
    "Canceled",
    "Basic · other",
    "Pro · other",
    "Life",
    "Staff",
    "Owner",
    "Admin",
    "No plan",
  ];

  const population = popOrder
    .filter((label) => popCounts[label])
    .concat(Object.keys(popCounts).filter((k) => !popOrder.includes(k)))
    .map((label) => {
      const count = popCounts[label] || 0;
      const revenue = label === "Basic · active" || label === "Pro · active";
      return {
        segment: label,
        count,
        share: users.length ? count / users.length : 0,
        revenue,
        mrr:
          label === "Basic · active"
            ? count * PLAN_MRR.basic
            : label === "Pro · active"
              ? count * PLAN_MRR.pro
              : 0,
      };
    });

  const subscribed = {
    total: subbedByPlan.basic + subbedByPlan.pro,
    basic: subbedByPlan.basic,
    pro: subbedByPlan.pro,
    byPlan: [
      { plan: "Basic", count: subbedByPlan.basic, mrr: subbedByPlan.basic * PLAN_MRR.basic },
      { plan: "Pro", count: subbedByPlan.pro, mrr: subbedByPlan.pro * PLAN_MRR.pro },
    ].filter((r) => r.count > 0),
  };

  return {
    total: users.length,
    confirmed,
    unconfirmed: users.length - confirmed,
    banned,
    staff,
    staffUsers,
    withStripe,
    withSub,
    termsAccepted,
    paying,
    estimatedMrr,
    revenueSeats,
    population,
    subscribed,
    activeSubSeries,
    fluxPeriod,
    signedIn7,
    signedIn30,
    signedIn90,
    neverSignedIn,
    periodEndingSoon,
    roles,
    statuses,
    monthlySignups,
    recent: recent.map((u) => ({ ...u, role: displayRole(u) })),
    endingSoon,
    loadedAt: new Date().toISOString(),
  };
}
