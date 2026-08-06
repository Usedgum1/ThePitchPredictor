import { parseExcelBuffer, readFileAsArrayBuffer } from "./data/excel.js";
import { normalizeGames, normalizeGamesFromPayloads } from "./data/games.js";
import { createDefaultFilters, filterGames, formatDataFilterLabel } from "./data/filters.js";
import { createSupabaseClient, fetchCurrentProfileRole, fetchHistoricalPayloads, isOwnerRole } from "./data/supabase.js";
import {
  analyzeCustomers,
  deleteOwnerUser,
  fetchOwnerUsers,
  fetchSubscriptionHistory,
  resendOwnerUserConfirmation,
  sendOwnerBroadcastEmail,
  setOwnerUserBanned,
  setOwnerUserRole,
  stripeCustomerSearchUrl,
} from "./data/customers.js";
import { analyzePageViews, fetchPageViews } from "./data/pageViews.js";
import { runAnalysis } from "./analytics/engine.js";
import { captureTableElement } from "./data/mediaCreator.js";
import { renderNav } from "./ui/nav.js";
import { renderView } from "./ui/render.js";
import { alertDialog, confirmDialog } from "./ui/dialog.js";
import { initMobileShell, isMobileShell } from "./ui/mobileShell.js";

/** @type {import("./data/filters.js").FilterState} */
let filters = createDefaultFilters();

/** @type {ReturnType<typeof createSupabaseClient> | null} */
let supabaseClient = null;

const state = {
  sourceLabel: /** @type {string | null} */ (null),
  sheetName: /** @type {string | null} */ (null),
  games: /** @type {import("./data/games.js").GameRow[]} */ ([]),
  filteredGames: /** @type {import("./data/games.js").GameRow[]} */ ([]),
  results: /** @type {object | null} */ (null),
  customers: /** @type {{ error?: string, analytics?: object, subscriptions?: object[], users?: object[], traffic?: object, trafficError?: string | null } | null} */ (null),
  customersLoading: false,
  /** @type {Promise<void> | null} */
  customersLoadPromise: null,
  customerFluxPeriod: /** @type {"daily"|"weekly"|"monthly"} */ ("monthly"),
  selectedAdminUserId: /** @type {string | null} */ (null),
  adminBusy: false,
  adminStatus: "",
  adminEmailStatus: "",
  activeView: "dashboard",
};

/** @type {ReturnType<typeof initMobileShell>} */
let mobileShell = null;

const el = {
  bootBanner: document.getElementById("boot-banner"),
  nav: document.getElementById("main-nav"),
  status: document.getElementById("status-text"),
  viewRoot: document.getElementById("view-root"),
  welcome: document.getElementById("welcome-panel"),
  tableSearch: document.getElementById("table-search"),
  btnUploadWelcome: document.getElementById("btn-upload-welcome"),
  btnLoadSupabase: document.getElementById("btn-load-supabase"),
  authForm: document.getElementById("auth-form"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authStatus: document.getElementById("auth-status"),
  fileInputWelcome: document.getElementById("file-input-welcome"),
  loading: document.getElementById("loading-overlay"),
  loadingMsg: document.getElementById("loading-message"),
  loadingDetail: document.getElementById("loading-detail"),
  filterStart: document.getElementById("sidebar-filter-start"),
  filterEnd: document.getElementById("sidebar-filter-end"),
  filterApply: document.getElementById("sidebar-filter-apply"),
  filterClear: document.getElementById("sidebar-filter-clear"),
  filterSample: document.getElementById("sidebar-filter-sample"),
};

function showBootBanner(message) {
  if (!el.bootBanner) return;
  el.bootBanner.innerHTML = message;
  el.bootBanner.classList.remove("hidden");
}

function setAuthStatus(text) {
  if (el.authStatus) el.authStatus.textContent = text;
}

function checkEnvironment() {
  if (location.protocol === "file:") {
    showBootBanner(
      "Open through a local web server. In <code>PitchIQ Report/HTML Version</code> run " +
        "<code>python -m http.server 8080</code> then visit <code>http://localhost:8080</code>."
    );
    return false;
  }
  if (typeof XLSX === "undefined") {
    showBootBanner("Excel library failed to load (cdn.sheetjs.com). Check network/firewall, then refresh.");
    return false;
  }
  if (!window.supabase?.createClient) {
    showBootBanner("Supabase library failed to load. Check network/firewall, then refresh.");
    return false;
  }
  return true;
}

function setLoading(show, message = "Working…", detail = "") {
  el.loading?.classList.toggle("hidden", !show);
  if (el.loadingMsg) el.loadingMsg.textContent = message;
  if (el.loadingDetail) el.loadingDetail.textContent = detail;
}

function setStatus(text) {
  if (el.status) el.status.textContent = text;
}

function applyTableSearch() {
  const q = (el.tableSearch?.value ?? "").trim().toLowerCase();
  if (!el.viewRoot) return;
  // Admin/Email/Site Alert/Media have their own filters — don't let the topbar search hide those rows.
  if (state.activeView === "admin" || state.activeView === "email" || state.activeView === "site-alert" || state.activeView === "media") {
    el.viewRoot.querySelectorAll("table.data-table tbody tr").forEach((tr) => {
      tr.classList.remove("row-hidden");
    });
    return;
  }
  el.viewRoot.querySelectorAll("table.data-table tbody tr").forEach((tr) => {
    const text = tr.textContent?.toLowerCase() ?? "";
    tr.classList.toggle("row-hidden", q.length > 0 && !text.includes(q));
  });
}

/**
 * @param {HTMLElement} captureEl
 * @param {string} label
 */
async function runSendToMedia(captureEl, label) {
  setLoading(true, "Capturing table…", label || "Media Creator");
  try {
    await captureTableElement(captureEl, label);
    selectView("media");
  } catch (error) {
    console.error(error);
    await alertDialog(error?.message || "Failed to capture table for Media Creator.", {
      title: "Media capture failed",
    });
  } finally {
    setLoading(false);
  }
}

function syncSidebarFilters() {
  if (el.filterStart) el.filterStart.value = filters.start || "";
  if (el.filterEnd) el.filterEnd.value = filters.end || "";
  if (!el.filterSample) return;
  if (!state.results) {
    el.filterSample.textContent = "";
    return;
  }
  const s = state.results.summary;
  const startLabel = s.dateStart
    ? s.dateStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const endLabel = s.dateEnd
    ? s.dateEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  el.filterSample.textContent = `${s.games.toLocaleString()} games · ${startLabel} → ${endLabel}`;
}

function applySidebarFilters() {
  filters = {
    start: String(el.filterStart?.value || ""),
    end: String(el.filterEnd?.value || ""),
  };
  if (!state.games.length) {
    syncSidebarFilters();
    return;
  }
  recompute();
}

function clearSidebarFilters() {
  filters = createDefaultFilters();
  syncSidebarFilters();
  if (!state.games.length) return;
  recompute();
}

function recompute() {
  const filtered = filterGames(state.games, filters);
  state.filteredGames = filtered;
  state.results = runAnalysis(filtered);
  refresh();
}

/** @param {"customers"|"admin"|"email"} [view] */
function needsCustomerLoad(view = "customers") {
  if (state.customers?.error) return true;
  if (!state.customers?.users) return true;
  if (view === "admin" || view === "email") return false;
  return !state.customers?.subscriptions || Boolean(state.customers?.analytics?.fluxError);
}

function shouldRefreshAfterCustomers() {
  return state.activeView === "customers" || state.activeView === "admin" || state.activeView === "email";
}

/** @param {string} id */
function selectView(id) {
  const allowed = new Set(["dashboard", "draftkings", "fanduel", "models", "pitchers", "games", "umps", "team", "customers", "admin", "email", "site-alert", "media"]);
  state.activeView = allowed.has(id) ? id : "dashboard";
  mobileShell?.setOpen(false);
  mobileShell?.syncViewTitle(state.activeView);
  if (
    (state.activeView === "customers" || state.activeView === "admin" || state.activeView === "email") &&
    needsCustomerLoad(state.activeView)
  ) {
    refresh();
    loadCustomers().finally(() => {
      if (shouldRefreshAfterCustomers()) refresh();
    });
    return;
  }
  refresh();
}

function refresh() {
  const allowed = new Set(["dashboard", "draftkings", "fanduel", "models", "pitchers", "games", "umps", "team", "customers", "admin", "email", "site-alert", "media"]);
  if (!allowed.has(state.activeView)) state.activeView = "dashboard";
  mobileShell?.syncViewTitle(state.activeView);
  if (!el.nav || !el.viewRoot || !state.results) return;
  renderNav(el.nav, state.activeView, selectView);
  renderView(el.viewRoot, state.activeView, state.results, state.customers, {
    dataFilterLabel: formatDataFilterLabel(filters),
    games: state.filteredGames,
    fluxPeriod: state.customerFluxPeriod,
    onFluxPeriodChange: recomputeCustomerFlux,
    selectedUserId: state.selectedAdminUserId,
    busy: state.adminBusy || state.customersLoading,
    status: state.adminStatus || (state.customersLoading && !state.customers?.users ? "Loading customers…" : ""),
    emailStatus: state.adminEmailStatus,
    onSelectUser: (userId) => {
      state.selectedAdminUserId = userId;
      state.adminStatus = "";
      refresh();
    },
    onRefresh: () => {
      runAdminRefresh().catch(() => {});
    },
    onSetRole: (userId, role) => {
      runAdminAction("set_role", userId, { role }).catch(() => {});
    },
    onBan: (userId) => {
      runAdminAction("ban", userId).catch(() => {});
    },
    onUnban: (userId) => {
      runAdminAction("unban", userId).catch(() => {});
    },
    onResend: (userId) => {
      runAdminAction("resend", userId).catch(() => {});
    },
    onOpenStripe: (userId) => {
      openAdminStripe(userId);
    },
    onDelete: (userId) => {
      runAdminAction("delete", userId).catch(() => {});
    },
    onSendEmail: (payload) => {
      runAdminSendEmail(payload).catch(() => {});
    },
    onRequestClient: () => ensureClient(),
    onSendToMedia: (captureEl, label) => runSendToMedia(captureEl, label),
  });
  el.welcome?.classList.add("hidden");
  el.viewRoot.classList.remove("hidden");
  document.getElementById("app")?.classList.remove("app--locked");
  setStatus(
    `${state.sourceLabel || "PitchIQ"} · ${state.results.summary.games.toLocaleString()} games` +
      (state.sheetName ? ` · ${state.sheetName}` : "")
  );
  syncSidebarFilters();
  applyTableSearch();
}

async function loadCustomers() {
  if (state.customersLoadPromise) return state.customersLoadPromise;

  state.customersLoadPromise = (async () => {
    const client = await ensureClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      state.customers = { error: "Sign in with your PitchIQ owner account to load customers." };
      return;
    }

    state.customersLoading = true;
    if (shouldRefreshAfterCustomers()) refresh();
    try {
      const [users, pageViewResult] = await Promise.all([
        fetchOwnerUsers(client),
        fetchPageViews(client, 30).catch((error) => ({
          rows: [],
          error: error?.message || "Failed to load page views.",
        })),
      ]);
      const trafficErrorRaw = pageViewResult.error || null;
      const trafficError = trafficErrorRaw && /pitchiq_page_views|schema cache|does not exist/i.test(trafficErrorRaw)
        ? "Page-view table missing — run supabase/migrations/20260806000000_page_views.sql in the Supabase SQL Editor."
        : trafficErrorRaw;
      const traffic = trafficErrorRaw ? null : analyzePageViews(pageViewResult.rows || []);

      // Paint Admin/Customers as soon as the user list is back; Stripe history can lag.
      const earlyAnalytics = analyzeCustomers(users, state.customers?.subscriptions || [], state.customerFluxPeriod);
      state.customers = {
        analytics: earlyAnalytics,
        subscriptions: state.customers?.subscriptions || [],
        users,
        traffic,
        trafficError,
      };
      if (shouldRefreshAfterCustomers()) refresh();

      let subscriptions = state.customers.subscriptions || [];
      let historyError = null;
      try {
        subscriptions = await fetchSubscriptionHistory(client);
      } catch (error) {
        console.error(error);
        historyError = error?.message || "Stripe subscription history unavailable.";
      }
      const analytics = analyzeCustomers(users, subscriptions, state.customerFluxPeriod);
      if (historyError) analytics.fluxError = historyError;
      state.customers = {
        analytics,
        subscriptions,
        users,
        traffic,
        trafficError,
      };
    } catch (error) {
      console.error(error);
      state.customers = {
        error: error?.message || "Failed to load customers. Owner role required.",
      };
    } finally {
      state.customersLoading = false;
    }
  })().finally(() => {
    state.customersLoadPromise = null;
  });

  return state.customersLoadPromise;
}

/** @param {"daily"|"weekly"|"monthly"} period */
function recomputeCustomerFlux(period) {
  if (!state.customers?.users) return;
  state.customerFluxPeriod = period;
  const analytics = analyzeCustomers(
    state.customers.users,
    state.customers.subscriptions || [],
    period
  );
  if (state.customers.analytics?.fluxError) {
    analytics.fluxError = state.customers.analytics.fluxError;
  }
  state.customers = { ...state.customers, analytics };
  refresh();
}

/** @param {string} userId */
function findAdminUser(userId) {
  return state.customers?.users?.find((u) => u.id === userId) || null;
}

/** @param {string} userId */
function openAdminStripe(userId) {
  const user = findAdminUser(userId);
  const url = stripeCustomerSearchUrl(user?.stripe_customer_id);
  if (!url) {
    state.adminStatus = "No Stripe customer id on this account.";
    refresh();
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  state.adminStatus = `Opened Stripe for ${user?.stripe_customer_id}.`;
  refresh();
}

async function runAdminRefresh() {
  state.adminBusy = true;
  state.adminStatus = "Refreshing customers…";
  refresh();
  try {
    await loadCustomers();
    state.adminStatus = "Customer list refreshed.";
  } catch (error) {
    state.adminStatus = error?.message || "Refresh failed.";
  } finally {
    state.adminBusy = false;
    refresh();
  }
}

/**
 * @param {{ subject: string, body: string, userIds: string[], all: boolean, audience: string }} payload
 */
async function runAdminSendEmail(payload) {
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const count = payload.all ? "ALL customers" : `${payload.userIds.length} recipient${payload.userIds.length === 1 ? "" : "s"}`;

  if (!subject || !body) {
    state.adminEmailStatus = "Subject and message are required.";
    refresh();
    return;
  }
  if (!payload.all && !payload.userIds.length) {
    state.adminEmailStatus = "No recipients selected.";
    refresh();
    return;
  }

  const ok = await confirmDialog(
    `Send “${subject}” to ${count}?\n\nAudience: ${payload.audience}\nThis uses Resend and cannot be undone.`,
    { title: "Send email", okLabel: "Send" }
  );
  if (!ok) return;

  const client = await ensureClient();
  state.adminBusy = true;
  state.adminEmailStatus = `Sending to ${count}…`;
  setLoading(true, "Sending email…", String(count));
  refresh();

  try {
    const result = await sendOwnerBroadcastEmail(client, {
      subject,
      body,
      userIds: payload.all ? [] : payload.userIds,
      all: Boolean(payload.all),
    });
    const sent = Number(result.sent || 0);
    const failed = Number(result.failed || 0);
    state.adminEmailStatus =
      failed > 0
        ? `Sent ${sent}, failed ${failed} (of ${result.total || sent + failed}).`
        : `Sent ${sent} email${sent === 1 ? "" : "s"}.`;
    await alertDialog(state.adminEmailStatus, { title: "Email send complete" });
  } catch (error) {
    console.error(error);
    const message = error?.message || "Failed to send email.";
    state.adminEmailStatus = message;
    await alertDialog(message, { title: "Email failed" });
  } finally {
    state.adminBusy = false;
    setLoading(false);
    refresh();
  }
}

/**
 * @param {"set_role"|"ban"|"unban"|"resend"|"delete"} action
 * @param {string} userId
 * @param {{ role?: string }} [extra]
 */
async function runAdminAction(action, userId, extra = {}) {
  const user = findAdminUser(userId);
  const label = user?.email || user?.username || userId.slice(0, 8);

  if (action === "ban") {
    const ok = await confirmDialog(`Ban ${label}? They will not be able to sign in.`, {
      title: "Ban account",
      okLabel: "Ban",
    });
    if (!ok) return;
  }
  if (action === "delete") {
    const ok = await confirmDialog(
      `Permanently delete ${label}? This cannot be undone. Cancel Stripe billing first if they pay.`,
      { title: "Delete account", okLabel: "Delete" }
    );
    if (!ok) return;
  }
  if (action === "set_role") {
    const nextRole = String(extra.role || "").trim().toLowerCase();
    if (nextRole === "owner") {
      state.adminStatus = "Owner cannot be assigned from the portal.";
      refresh();
      return;
    }
    const roleLabel = nextRole || "none";
    const ok = await confirmDialog(`Set ${label} account type to “${roleLabel}”? (profiles.role only — not Stripe)`, {
      title: "Alter membership",
      okLabel: "Save role",
    });
    if (!ok) return;
  }

  const client = await ensureClient();
  state.adminBusy = true;
  state.adminStatus = "Working…";
  refresh();

  try {
    if (action === "set_role") {
      await setOwnerUserRole(client, userId, extra.role || null);
      state.adminStatus = `Role updated to ${extra.role || "none"}.`;
    } else if (action === "ban") {
      await setOwnerUserBanned(client, userId, true);
      state.adminStatus = `Banned ${label}.`;
    } else if (action === "unban") {
      await setOwnerUserBanned(client, userId, false);
      state.adminStatus = `Unbanned ${label}.`;
    } else if (action === "resend") {
      await resendOwnerUserConfirmation(client, userId);
      state.adminStatus = `Confirmation email resent to ${label}.`;
    } else if (action === "delete") {
      await deleteOwnerUser(client, userId);
      state.selectedAdminUserId = null;
      state.adminStatus = `Deleted ${label}.`;
    }
    await loadCustomers();
  } catch (error) {
    console.error(error);
    const message = error?.message || "Admin action failed.";
    state.adminStatus = message;
    await alertDialog(message, { title: "Admin action failed" });
  } finally {
    state.adminBusy = false;
    refresh();
  }
}

/**
 * @param {import("./data/games.js").GameRow[]} games
 * @param {string} sourceLabel
 * @param {string | null} [sheetName]
 */
function applyGames(games, sourceLabel, sheetName = null) {
  state.games = games;
  state.sourceLabel = sourceLabel;
  state.sheetName = sheetName;
  filters = createDefaultFilters();
  state.activeView = "dashboard";
  recompute();
}

async function ensureClient() {
  if (!supabaseClient) supabaseClient = createSupabaseClient();
  return supabaseClient;
}

const CUSTOMER_APP_URL = new URL(
  isMobileShell() ? "../app-mobile.html" : "../app.html",
  window.location.href
).href;

/**
 * Hard gate: only profiles.role === "owner" may use this portal.
 * @param {{ redirect?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, session: object | null, role: string | null }>}
 */
async function requireOwnerAccess(opts = {}) {
  const redirect = opts.redirect !== false;
  const client = await ensureClient();
  const { session, role, error } = await fetchCurrentProfileRole(client);

  if (!session) {
    return { ok: false, session: null, role: null };
  }

  if (error) {
    console.error(error);
    setAuthStatus(error.message || "Could not verify owner role.");
    if (redirect) {
      showBootBanner("Could not verify owner access. Returning to the app…");
      window.setTimeout(() => window.location.replace(CUSTOMER_APP_URL), 1200);
    }
    return { ok: false, session, role: null };
  }

  if (!isOwnerRole(role)) {
    setAuthStatus("Owner access only.");
    if (redirect) {
      showBootBanner("Owner access only. Returning to the app…");
      window.setTimeout(() => window.location.replace(CUSTOMER_APP_URL), 900);
    }
    return { ok: false, session, role };
  }

  return { ok: true, session, role };
}

async function loadFromSupabase() {
  const access = await requireOwnerAccess({ redirect: true });
  if (!access.ok) {
    if (!access.session) {
      setAuthStatus("Sign in with your PitchIQ owner account.");
      setStatus("Owner sign-in required.");
    }
    return;
  }

  const client = await ensureClient();
  const session = access.session;

  setLoading(true, "Loading historical rows from Supabase…", "pitchiq_historical_rows");
  try {
    const payloads = await fetchHistoricalPayloads(client, (loaded) => {
      setLoading(true, "Loading historical rows from Supabase…", `${loaded.toLocaleString()} rows`);
    });

    if (!payloads.length) {
      const hint = session
        ? "Signed in, but no historical rows came back. Confirm the desktop/headless worker is pushing history, or upload an Excel export."
        : "No historical rows visible. Sign in with your PitchIQ account below (RLS blocks anonymous reads), or upload an Excel export.";
      throw new Error(hint);
    }

    setLoading(true, "Running PitchIQ analysis…", `${payloads.length.toLocaleString()} payloads`);
    const games = normalizeGamesFromPayloads(payloads);
    applyGames(games, session?.user?.email ? `Supabase (${session.user.email})` : "Supabase", "pitchiq_historical_rows");
    loadCustomers().then(() => {
      if (shouldRefreshAfterCustomers()) refresh();
    });
  } catch (error) {
    console.error(error);
    const message = error?.message || "Failed to load Supabase historical rows.";
    setStatus("Supabase load failed — sign in or upload an Excel export.");
    setAuthStatus(message);
    throw error;
  } finally {
    setLoading(false);
  }
}

/**
 * @param {File} file
 */
async function handleFile(file) {
  const access = await requireOwnerAccess({ redirect: true });
  if (!access.ok) {
    await alertDialog("Owner access only.", { title: "Access denied" });
    return;
  }

  setLoading(true, "Reading export…", file.name);
  try {
    const buffer = await readFileAsArrayBuffer(file, () => {});
    setLoading(true, "Parsing Game History…", file.name);
    const parsed = await parseExcelBuffer(buffer);
    setLoading(true, "Running PitchIQ analysis…", `${parsed.rows.length.toLocaleString()} rows`);
    const games = normalizeGames(parsed.headers, parsed.rows);
    applyGames(games, file.name, parsed.sheetName);
  } catch (error) {
    console.error(error);
    await alertDialog(error?.message || "Failed to analyze export.", { title: "Upload failed" });
  } finally {
    setLoading(false);
  }
}

function wireUpload(button, input) {
  button?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) await handleFile(file);
  });
}

async function signInAndLoad(event) {
  event?.preventDefault?.();
  const email = String(el.authEmail?.value || "").trim();
  const password = String(el.authPassword?.value || "");
  if (!email || !password) {
    setAuthStatus("Enter email and password.");
    return;
  }

  const client = await ensureClient();
  setAuthStatus("Signing in…");
  setLoading(true, "Signing in…", email);
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const access = await requireOwnerAccess({ redirect: false });
    if (!access.ok) {
      await client.auth.signOut();
      setAuthStatus("Owner access only. This account is not an owner.");
      await alertDialog("Owner access only. Standard accounts cannot open the Owners Portal.", {
        title: "Access denied",
      });
      return;
    }

    setAuthStatus("Signed in as owner. Loading history…");
    await loadFromSupabase();
  } catch (error) {
    console.error(error);
    setAuthStatus(error?.message || "Sign-in failed.");
    await alertDialog(error?.message || "Sign-in failed.", { title: "Auth failed" });
  } finally {
    setLoading(false);
  }
}

async function boot() {
  if (!checkEnvironment()) return;
  mobileShell = initMobileShell();
  await ensureClient();

  renderNav(el.nav, state.activeView, (id) => {
    if (!state.results) {
      setStatus("Sign in to Supabase (or upload an export) to unlock the dashboard.");
      mobileShell?.setOpen(false);
      return;
    }
    selectView(id);
  });

  wireUpload(el.btnUploadWelcome, el.fileInputWelcome);
  el.btnLoadSupabase?.addEventListener("click", () => {
    loadFromSupabase().catch(() => {});
  });
  el.authForm?.addEventListener("submit", (event) => {
    signInAndLoad(event).catch(() => {});
  });
  el.tableSearch?.addEventListener("input", applyTableSearch);
  el.filterApply?.addEventListener("click", applySidebarFilters);
  el.filterClear?.addEventListener("click", clearSidebarFilters);
  el.filterStart?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applySidebarFilters();
  });
  el.filterEnd?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") applySidebarFilters();
  });
  syncSidebarFilters();

  const client = await ensureClient();
  const {
    data: { session },
  } = await client.auth.getSession();

  if (session) {
    const access = await requireOwnerAccess({ redirect: true });
    if (!access.ok) {
      setStatus("Owner access only.");
      return;
    }
    setAuthStatus(`Owner session for ${session.user.email || "user"}. Loading…`);
    setStatus("Loading PitchIQ historical data from Supabase…");
    try {
      await loadFromSupabase();
    } catch {
      setStatus("Sign in or upload an Excel export to continue.");
    }
    return;
  }

  setStatus("Sign in with an owner account to load Supabase history, or upload an Excel export.");
  setAuthStatus("Owner sign-in required — anonymous / non-owner access is blocked.");
}

boot();
