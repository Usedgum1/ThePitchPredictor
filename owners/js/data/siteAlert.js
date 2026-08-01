export const SITE_ALERT_ID = "global_alert";

export const DEFAULT_SITE_ALERT = Object.freeze({
  enabled: false,
  alert_published: false,
  text: "DraftKings is currently experiencing issues with the API.",
  prefix_text: "Alert!",
  suffix_text: "",
  speed_seconds: 24,
  background_color: "#250814",
  text_color: "#ffffff",
  accent_color: "#ff174d",
  font_family: "Segoe UI, Arial, sans-serif",
  text_transform: "none",
  font_weight: "700",
  appearance_presets: [],
  text_presets: [],
});

export const ALERT_FONT_OPTIONS = [
  { value: "Segoe UI, Arial, sans-serif", label: "Clean Sans" },
  { value: "Georgia, serif", label: "Editorial Serif" },
  { value: "Consolas, monospace", label: "Data Mono" },
];

/** Built-in look themes (appearance only). */
export const ALERT_THEME_PRESETS = Object.freeze([
  {
    id: "red-alert",
    name: "Red Alert",
    blurb: "Errors & outages",
    settings: {
      speed_seconds: 22,
      background_color: "#1a050c",
      text_color: "#ffffff",
      accent_color: "#ff174d",
      font_family: "Segoe UI, Arial, sans-serif",
      text_transform: "uppercase",
      font_weight: "800",
    },
  },
  {
    id: "draftkings",
    name: "DraftKings",
    blurb: "DK look",
    settings: {
      speed_seconds: 24,
      background_color: "#06140a",
      text_color: "#f3fff0",
      accent_color: "#53d337",
      font_family: "Segoe UI, Arial, sans-serif",
      text_transform: "none",
      font_weight: "700",
    },
  },
  {
    id: "fanduel",
    name: "FanDuel",
    blurb: "FD look",
    settings: {
      speed_seconds: 24,
      background_color: "#061018",
      text_color: "#f0f7ff",
      accent_color: "#1493ff",
      font_family: "Segoe UI, Arial, sans-serif",
      text_transform: "none",
      font_weight: "700",
    },
  },
  {
    id: "pitchiq",
    name: "PitchIQ",
    blurb: "Brand look",
    settings: {
      speed_seconds: 26,
      background_color: "#0c0a08",
      text_color: "#f4f0e8",
      accent_color: "#ff942e",
      font_family: "Segoe UI, Arial, sans-serif",
      text_transform: "none",
      font_weight: "700",
    },
  },
]);

/** Built-in message presets (verbage only). */
export const ALERT_MESSAGE_PRESETS = Object.freeze([
  {
    id: "red-alert",
    name: "Red Alert",
    blurb: "Errors & outages",
    settings: {
      prefix_text: "ALERT",
      text: "We're fixing an issue right now. Some features may be unavailable.",
      suffix_text: "",
    },
  },
  {
    id: "draftkings",
    name: "DraftKings",
    blurb: "DK wording",
    settings: {
      prefix_text: "DraftKings",
      text: "DraftKings odds or data may be delayed or incomplete.",
      suffix_text: "",
    },
  },
  {
    id: "fanduel",
    name: "FanDuel",
    blurb: "FD wording",
    settings: {
      prefix_text: "FanDuel",
      text: "FanDuel odds or data may be delayed or incomplete.",
      suffix_text: "",
    },
  },
  {
    id: "pitchiq",
    name: "PitchIQ",
    blurb: "Brand wording",
    settings: {
      prefix_text: "PitchIQ",
      text: "Heads up — a site update is in progress. Refresh if something looks off.",
      suffix_text: "",
    },
  },
]);

/**
 * @param {ReturnType<typeof normalizeSiteAlert>} settings
 */
export function matchAlertThemeId(settings) {
  const normalized = normalizeAppearance(settings || {});
  return (
    ALERT_THEME_PRESETS.find((theme) => {
      const t = theme.settings;
      return (
        t.background_color.toLowerCase() === normalized.background_color.toLowerCase() &&
        t.text_color.toLowerCase() === normalized.text_color.toLowerCase() &&
        t.accent_color.toLowerCase() === normalized.accent_color.toLowerCase()
      );
    })?.id || ""
  );
}

/**
 * @param {ReturnType<typeof normalizeSiteAlert>} settings
 */
export function matchAlertMessageId(settings) {
  const normalized = normalizeText(settings || {});
  return (
    ALERT_MESSAGE_PRESETS.find((preset) => {
      const t = preset.settings;
      return (
        t.prefix_text === normalized.prefix_text &&
        t.text === normalized.text &&
        t.suffix_text === normalized.suffix_text
      );
    })?.id || ""
  );
}

function clampSpeed(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed)) return DEFAULT_SITE_ALERT.speed_seconds;
  return Math.min(90, Math.max(8, Math.round(speed)));
}

function cleanColor(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function normalizeAppearance(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const fontFamily = ALERT_FONT_OPTIONS.some((o) => o.value === source.font_family)
    ? source.font_family
    : DEFAULT_SITE_ALERT.font_family;
  return {
    speed_seconds: clampSpeed(source.speed_seconds),
    background_color: cleanColor(source.background_color, DEFAULT_SITE_ALERT.background_color),
    text_color: cleanColor(source.text_color, DEFAULT_SITE_ALERT.text_color),
    accent_color: cleanColor(source.accent_color, DEFAULT_SITE_ALERT.accent_color),
    font_family: fontFamily,
    text_transform: source.text_transform === "uppercase" ? "uppercase" : "none",
    font_weight: ["600", "700", "800"].includes(String(source.font_weight))
      ? String(source.font_weight)
      : DEFAULT_SITE_ALERT.font_weight,
  };
}

function normalizeText(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    text: String(source.text ?? DEFAULT_SITE_ALERT.text).slice(0, 240),
    prefix_text: String(source.prefix_text ?? DEFAULT_SITE_ALERT.prefix_text).slice(0, 32),
    suffix_text: String(source.suffix_text ?? DEFAULT_SITE_ALERT.suffix_text).slice(0, 32),
  };
}

function normalizePresetList(presets, normalizeSettings) {
  if (!Array.isArray(presets)) return [];
  return presets
    .filter((preset) => preset && typeof preset === "object" && String(preset.name || "").trim())
    .map((preset) => ({
      name: String(preset.name || "").trim().slice(0, 48),
      settings: normalizeSettings(preset.settings || {}),
    }))
    .filter((preset, index, all) => all.findIndex((c) => c.name === preset.name) === index)
    .slice(0, 20);
}

/** @param {unknown} payload */
export function normalizeSiteAlert(payload = {}) {
  const source = payload && typeof payload === "object" ? /** @type {Record<string, unknown>} */ (payload) : {};
  return {
    ...DEFAULT_SITE_ALERT,
    ...normalizeAppearance(source),
    ...normalizeText(source),
    enabled: Boolean(source.enabled),
    alert_published: Boolean(source.alert_published),
    appearance_presets: normalizePresetList(source.appearance_presets, normalizeAppearance),
    text_presets: normalizePresetList(source.text_presets, normalizeText),
  };
}

/** @param {ReturnType<typeof normalizeSiteAlert>} settings */
export function isLiveSiteAlert(settings) {
  return Boolean(settings?.enabled && settings?.alert_published && String(settings?.text || "").trim());
}

/** @param {ReturnType<typeof normalizeSiteAlert>} settings */
export function alertDisplayText(settings) {
  const prefix = String(settings.prefix_text || "").trim();
  const text = String(settings.text || "").trim();
  const suffix = String(settings.suffix_text || "").trim();
  return [prefix, text, suffix].filter(Boolean).join(" ");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 */
export async function fetchSiteAlert(client) {
  // Match the live site query shape (payload). updated_at is optional metadata.
  const { data, error } = await client
    .from("pitchiq_site_settings")
    .select("payload, updated_at")
    .eq("id", SITE_ALERT_ID)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load site alert.");
  return {
    settings: normalizeSiteAlert(data?.payload || DEFAULT_SITE_ALERT),
    updated_at: data?.updated_at || null,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {object} settings
 */
export async function saveSiteAlert(client, settings) {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();
  if (sessionError || !session?.user?.id) {
    throw new Error("Sign in with an owner account to publish alerts.");
  }

  const payload = normalizeSiteAlert(settings);
  const { data, error } = await client
    .from("pitchiq_site_settings")
    .upsert(
      {
        id: SITE_ALERT_ID,
        payload,
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select("payload, updated_at")
    .single();

  if (error) throw new Error(error.message || "Failed to save site alert.");
  return {
    settings: normalizeSiteAlert(data?.payload || payload),
    updated_at: data?.updated_at || null,
  };
}
