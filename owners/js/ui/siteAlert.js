import {
  ALERT_FONT_OPTIONS,
  ALERT_MESSAGE_PRESETS,
  ALERT_THEME_PRESETS,
  DEFAULT_SITE_ALERT,
  alertDisplayText,
  fetchSiteAlert,
  isLiveSiteAlert,
  matchAlertMessageId,
  matchAlertThemeId,
  normalizeSiteAlert,
  saveSiteAlert,
} from "../data/siteAlert.js";

/** @type {{
 *   loaded: boolean,
 *   loading: boolean,
 *   busy: boolean,
 *   dirty: boolean,
 *   error: string,
 *   status: string,
 *   draft: ReturnType<typeof normalizeSiteAlert>,
 *   published: ReturnType<typeof normalizeSiteAlert>,
 *   updated_at: string | null,
 *   loadPromise: Promise<void> | null,
 *   mountId: number,
 * }} */
const alertUi = {
  loaded: false,
  loading: false,
  busy: false,
  dirty: false,
  error: "",
  status: "",
  draft: normalizeSiteAlert(DEFAULT_SITE_ALERT),
  published: normalizeSiteAlert(DEFAULT_SITE_ALERT),
  updated_at: null,
  loadPromise: null,
  mountId: 0,
};

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string | null | undefined} iso */
function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** @param {ReturnType<typeof normalizeSiteAlert>} settings */
function messageHtml(settings) {
  const prefix = String(settings.prefix_text || "").trim();
  const text = String(settings.text || "").trim();
  const suffix = String(settings.suffix_text || "").trim();
  return `${prefix ? `<span class="site-alert-prefix">${escapeHtml(prefix)}</span>` : ""}${escapeHtml(text)}${suffix ? `<span class="site-alert-suffix">${escapeHtml(suffix)}</span>` : ""}`;
}

/**
 * @param {HTMLElement} el
 * @param {ReturnType<typeof normalizeSiteAlert>} settings
 */
function applyAlertStyles(el, settings) {
  el.style.setProperty("--alert-bg", settings.background_color);
  el.style.setProperty("--alert-text", settings.text_color);
  el.style.setProperty("--alert-accent", settings.accent_color);
  el.style.setProperty("--alert-speed", `${settings.speed_seconds}s`);
  el.style.setProperty("--alert-font-family", settings.font_family);
  el.style.setProperty("--alert-text-transform", settings.text_transform);
  el.style.setProperty("--alert-font-weight", settings.font_weight);
  const themeId = matchAlertThemeId(settings);
  el.dataset.alertTheme = themeId || "custom";
}

/**
 * @param {HTMLElement} container
 * @param {HTMLElement} messageElement
 */
function updateAlertTravel(container, messageElement) {
  window.requestAnimationFrame(() => {
    const track = container.querySelector(".site-alert-track");
    const containerWidth = Math.max(1, container.clientWidth);
    const messageWidth = Math.max(1, messageElement.scrollWidth);
    container.style.setProperty("--alert-start-x", `${containerWidth}px`);
    container.style.setProperty("--alert-end-x", `${-messageWidth}px`);
    if (track instanceof HTMLElement) {
      track.style.animation = "none";
      void track.offsetWidth;
      track.style.animation = "";
    }
  });
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ replaceDraft?: boolean }} [options]
 */
async function loadSiteAlertUi(client, options = {}) {
  const replaceDraft = options.replaceDraft !== false;
  alertUi.loading = true;
  alertUi.error = "";
  try {
    const result = await fetchSiteAlert(client);
    alertUi.published = result.settings;
    // Don't clobber in-progress edits unless this is an explicit reload / first hydrate.
    if (replaceDraft && !alertUi.dirty) {
      alertUi.draft = normalizeSiteAlert(result.settings);
    }
    alertUi.updated_at = result.updated_at;
    alertUi.loaded = true;
    alertUi.status = isLiveSiteAlert(result.settings)
      ? "Alert is live on thePitchIQ.com."
      : "No alert is currently published.";
  } catch (error) {
    alertUi.error = error?.message || "Failed to load site alert.";
    alertUi.loaded = true;
    alertUi.status = "Could not load alert settings.";
  } finally {
    alertUi.loading = false;
  }
}

/**
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 * @param {{ force?: boolean, replaceDraft?: boolean }} [options]
 */
function ensureLoaded(opts, options = {}) {
  const force = Boolean(options.force);
  const replaceDraft = options.replaceDraft ?? (force || !alertUi.loaded);

  if (alertUi.loadPromise && !force) return alertUi.loadPromise;
  if (alertUi.loaded && !force) return Promise.resolve();

  if (force && replaceDraft) alertUi.dirty = false;

  alertUi.loading = true;
  alertUi.loadPromise = opts
    .onRequestClient()
    .then((client) => loadSiteAlertUi(client, { replaceDraft }))
    .catch((error) => {
      alertUi.error = error?.message || "Failed to load site alert.";
      alertUi.loaded = true;
      alertUi.status = "Could not load alert settings.";
      alertUi.loading = false;
    })
    .finally(() => {
      alertUi.loadPromise = null;
    });

  return alertUi.loadPromise;
}

function readDraftFromForm(root) {
  const get = (id) =>
    /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (
      root.querySelector(`#${id}`)
    );
  return normalizeSiteAlert({
    ...alertUi.draft,
    text: get("site-alert-text")?.value || "",
    prefix_text: get("site-alert-prefix")?.value || "",
    suffix_text: get("site-alert-suffix")?.value || "",
    speed_seconds: get("site-alert-speed")?.value || DEFAULT_SITE_ALERT.speed_seconds,
    background_color: get("site-alert-bg")?.value || DEFAULT_SITE_ALERT.background_color,
    text_color: get("site-alert-fg")?.value || DEFAULT_SITE_ALERT.text_color,
    accent_color: get("site-alert-accent")?.value || DEFAULT_SITE_ALERT.accent_color,
    font_family: get("site-alert-font")?.value || DEFAULT_SITE_ALERT.font_family,
    text_transform: get("site-alert-transform")?.value || "none",
    font_weight: get("site-alert-weight")?.value || DEFAULT_SITE_ALERT.font_weight,
    appearance_presets: alertUi.draft.appearance_presets,
    text_presets: alertUi.draft.text_presets,
  });
}

/**
 * @param {HTMLElement | null} ticker
 * @param {HTMLElement | null} message
 * @param {HTMLElement | null} copy
 * @param {ReturnType<typeof normalizeSiteAlert>} settings
 * @param {boolean} [forceShow]
 */
function paintTicker(ticker, message, copy, settings, forceShow = false) {
  if (!ticker || !message || !copy) return;
  applyAlertStyles(ticker, settings);
  const html = messageHtml(settings);
  message.innerHTML = html;
  copy.innerHTML = html;
  const hasText = Boolean(String(settings.text || "").trim());
  const show = forceShow ? hasText : isLiveSiteAlert(settings);
  ticker.classList.toggle("is-empty", !hasText);
  ticker.classList.toggle("hidden", !show);
  ticker.setAttribute("aria-hidden", show ? "false" : "true");
  if (show) updateAlertTravel(ticker, message);
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<typeof normalizeSiteAlert>} settings
 */
function paintDraftPreview(root, settings) {
  paintTicker(
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-preview")),
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-preview-message")),
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-preview-copy")),
    settings,
    true
  );
  const plain = root.querySelector(".site-alert-preview-plain");
  if (plain) plain.textContent = alertDisplayText(settings) || "Add alert text to preview.";
}

/**
 * @param {HTMLElement} root
 */
function paintLiveCurrent(root) {
  const live = isLiveSiteAlert(alertUi.published);
  const card = root.querySelector(".site-alert-current-card");
  card?.classList.toggle("is-live", live);
  card?.classList.toggle("is-off", !live);

  const liveLabel = root.querySelector("#site-alert-live-label");
  if (liveLabel) {
    liveLabel.textContent = live ? "Live on site" : "Not published";
  }

  const line = root.querySelector("#site-alert-current-line");
  if (line) {
    line.textContent = live ? alertDisplayText(alertUi.published) : "None";
    line.classList.toggle("is-none", !live);
  }

  paintTicker(
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-current-ticker")),
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-current-message")),
    /** @type {HTMLElement | null} */ (root.querySelector("#site-alert-current-copy")),
    alertUi.published,
    false
  );

  const meta = root.querySelector("#site-alert-current-meta");
  if (meta) {
    meta.textContent = live
      ? `Updated ${fmtWhen(alertUi.updated_at)}`
      : alertUi.loading
        ? "Checking…"
        : `Last saved ${fmtWhen(alertUi.updated_at)}`;
  }

  const status = root.querySelector("#site-alert-current-status");
  if (status) {
    const statusText =
      alertUi.status ||
      (alertUi.loading ? "Loading alert settings…" : "") ||
      (alertUi.error ? alertUi.error : "");
    status.textContent = statusText;
    status.hidden = !statusText;
  }

  const turnOff = /** @type {HTMLButtonElement | null} */ (root.querySelector("#site-alert-turn-off"));
  if (turnOff) turnOff.disabled = alertUi.busy || !live;
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 */
function paint(root, opts) {
  const mountId = ++alertUi.mountId;
  const draft = alertUi.draft;
  const live = isLiveSiteAlert(alertUi.published);
  const actionBusy = alertUi.busy;
  // Keep fields editable while loading — only block publish/turn-off during save.
  const fieldsDisabled = actionBusy;

  const appearanceOptions = ALERT_FONT_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.value)}" ${draft.font_family === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`
  ).join("");

  const activeThemeId = matchAlertThemeId(draft);
  const themeChips = ALERT_THEME_PRESETS.map((theme) => {
    const active = theme.id === activeThemeId;
    return `<button type="button" class="site-alert-theme-chip${active ? " is-active" : ""}" data-alert-theme="${escapeHtml(theme.id)}" style="--swatch-bg:${escapeHtml(theme.settings.background_color)};--swatch-accent:${escapeHtml(theme.settings.accent_color)}" ${fieldsDisabled ? "disabled" : ""} title="${escapeHtml(theme.blurb)}">
      <span class="site-alert-theme-swatch" style="--swatch-bg:${escapeHtml(theme.settings.background_color)};--swatch-accent:${escapeHtml(theme.settings.accent_color)}" aria-hidden="true"></span>
      <span class="site-alert-theme-copy">
        <span class="site-alert-theme-name">${escapeHtml(theme.name)}</span>
        <span class="site-alert-theme-blurb">${escapeHtml(theme.blurb)}</span>
      </span>
    </button>`;
  }).join("");

  const activeMessageId = matchAlertMessageId(draft);
  const messageChips = ALERT_MESSAGE_PRESETS.map((preset) => {
    const active = preset.id === activeMessageId;
    return `<button type="button" class="site-alert-message-chip${active ? " is-active" : ""}" data-alert-message="${escapeHtml(preset.id)}" ${fieldsDisabled ? "disabled" : ""} title="${escapeHtml(preset.settings.text)}">
      <span class="site-alert-theme-copy">
        <span class="site-alert-theme-name">${escapeHtml(preset.name)}</span>
        <span class="site-alert-theme-blurb">${escapeHtml(preset.blurb)}</span>
      </span>
    </button>`;
  }).join("");

  const appearancePresets = draft.appearance_presets
    .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
    .join("");
  const textPresets = draft.text_presets
    .map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`)
    .join("");

  const statusText =
    alertUi.status ||
    (alertUi.loading ? "Loading alert settings…" : "") ||
    (alertUi.error ? alertUi.error : "");

  root.innerHTML = `
    <div class="book-theme-customers site-alert-page" data-site-alert-root="1">
      <div class="page-header book-page-header book-customers">
        <div class="admin-page-head">
          <div>
            <h2 class="page-title">Site Alert</h2>
            <p class="page-sub">Publish a scrolling banner on thePitchIQ.com — same store the live site already reads.</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="site-alert-reload" ${actionBusy ? "disabled" : ""}>Reload</button>
        </div>
      </div>

      ${alertUi.error ? `<div class="card site-alert-status-card is-error"><p class="page-sub" style="margin:0;">${escapeHtml(alertUi.error)}</p></div>` : ""}

      <div class="card site-alert-current-card ${live ? "is-live" : "is-off"}">
        <div class="site-alert-current-head">
          <div class="site-alert-current-title-row">
            <h3 class="card-title">Current Update</h3>
            <span class="site-alert-live-badge" id="site-alert-live-badge">
              <span class="site-alert-status-dot" aria-hidden="true"></span>
              <span id="site-alert-live-label">${live ? "Live on site" : "Not published"}</span>
            </span>
            <p class="page-sub muted" id="site-alert-current-meta" style="margin:0;"></p>
          </div>
          <div class="site-alert-status-actions">
            <button type="button" class="btn btn-danger" id="site-alert-turn-off" ${actionBusy || !live ? "disabled" : ""}>Turn off</button>
          </div>
        </div>
        <p class="site-alert-current-line ${live ? "" : "is-none"}" id="site-alert-current-line">${live ? escapeHtml(alertDisplayText(alertUi.published)) : "None"}</p>
        <div class="site-alert-ticker ${live ? "" : "hidden"}" id="site-alert-current-ticker" aria-hidden="${live ? "false" : "true"}">
          <div class="site-alert-track">
            <span class="site-alert-message" id="site-alert-current-message"></span>
            <span class="site-alert-message" id="site-alert-current-copy" aria-hidden="true"></span>
          </div>
        </div>
        <p class="page-sub site-alert-current-status" id="site-alert-current-status"${statusText ? "" : " hidden"}>${escapeHtml(statusText)}</p>
      </div>

      <div class="site-alert-layout">
        <div class="card site-alert-panel">
          <h3 class="card-title">Message</h3>
          <div class="site-alert-theme-grid" role="group" aria-label="Message presets">
            ${messageChips}
          </div>
          <div class="site-alert-form-grid">
            <label class="admin-filter-field">
              <span>Prefix</span>
              <input id="site-alert-prefix" type="text" class="admin-filter-input" maxlength="32" value="${escapeHtml(draft.prefix_text)}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field">
              <span>Suffix</span>
              <input id="site-alert-suffix" type="text" class="admin-filter-input" maxlength="32" value="${escapeHtml(draft.suffix_text)}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field site-alert-field-span">
              <span>Alert text</span>
              <textarea id="site-alert-text" class="admin-email-body site-alert-text" rows="3" maxlength="240" ${fieldsDisabled ? "disabled" : ""}>${escapeHtml(draft.text)}</textarea>
            </label>
          </div>

          <div class="site-alert-preset-row">
            <label class="admin-filter-field">
              <span>Saved text preset</span>
              <select id="site-alert-text-preset" class="admin-select" ${fieldsDisabled || !draft.text_presets.length ? "disabled" : ""}>
                <option value="">Select…</option>
                ${textPresets}
              </select>
            </label>
            <div class="site-alert-preset-actions">
              <input id="site-alert-text-preset-name" type="text" class="admin-filter-input" maxlength="48" placeholder="Preset name" ${fieldsDisabled ? "disabled" : ""} />
              <button type="button" class="btn btn-ghost btn-sm" id="site-alert-save-text-preset" ${fieldsDisabled ? "disabled" : ""}>Save text</button>
            </div>
          </div>
        </div>

        <div class="card site-alert-panel">
          <h3 class="card-title">Appearance</h3>
          <div class="site-alert-theme-grid" role="group" aria-label="Theme presets">
            ${themeChips}
          </div>
          <div class="site-alert-form-grid site-alert-appearance-grid">
            <label class="admin-filter-field">
              <span>Background</span>
              <input id="site-alert-bg" type="color" class="site-alert-color" value="${escapeHtml(draft.background_color)}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field">
              <span>Text</span>
              <input id="site-alert-fg" type="color" class="site-alert-color" value="${escapeHtml(draft.text_color)}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field">
              <span>Accent</span>
              <input id="site-alert-accent" type="color" class="site-alert-color" value="${escapeHtml(draft.accent_color)}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field">
              <span>Speed (sec)</span>
              <input id="site-alert-speed" type="number" class="admin-filter-input" min="8" max="90" step="1" value="${escapeHtml(String(draft.speed_seconds))}" ${fieldsDisabled ? "disabled" : ""} />
            </label>
            <label class="admin-filter-field">
              <span>Font</span>
              <select id="site-alert-font" class="admin-select" ${fieldsDisabled ? "disabled" : ""}>${appearanceOptions}</select>
            </label>
            <label class="admin-filter-field">
              <span>Weight</span>
              <select id="site-alert-weight" class="admin-select" ${fieldsDisabled ? "disabled" : ""}>
                <option value="600" ${draft.font_weight === "600" ? "selected" : ""}>Semibold</option>
                <option value="700" ${draft.font_weight === "700" ? "selected" : ""}>Bold</option>
                <option value="800" ${draft.font_weight === "800" ? "selected" : ""}>Extra bold</option>
              </select>
            </label>
            <label class="admin-filter-field">
              <span>Transform</span>
              <select id="site-alert-transform" class="admin-select" ${fieldsDisabled ? "disabled" : ""}>
                <option value="none" ${draft.text_transform === "none" ? "selected" : ""}>Normal</option>
                <option value="uppercase" ${draft.text_transform === "uppercase" ? "selected" : ""}>Uppercase</option>
              </select>
            </label>
          </div>

          <div class="site-alert-preset-row">
            <label class="admin-filter-field">
              <span>Saved look preset</span>
              <select id="site-alert-look-preset" class="admin-select" ${fieldsDisabled || !draft.appearance_presets.length ? "disabled" : ""}>
                <option value="">Select…</option>
                ${appearancePresets}
              </select>
            </label>
            <div class="site-alert-preset-actions">
              <input id="site-alert-look-preset-name" type="text" class="admin-filter-input" maxlength="48" placeholder="Preset name" ${fieldsDisabled ? "disabled" : ""} />
              <button type="button" class="btn btn-ghost btn-sm" id="site-alert-save-look-preset" ${fieldsDisabled ? "disabled" : ""}>Save look</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card site-alert-preview-card">
        <div class="site-alert-draft-head">
          <div>
            <h3 class="card-title">Draft preview</h3>
            <p class="page-sub muted" style="margin:0.15rem 0 0;">Updates as you edit — publish to push live</p>
          </div>
          <button type="button" class="btn btn-primary" id="site-alert-publish" ${actionBusy ? "disabled" : ""}>Publish</button>
        </div>
        <div class="site-alert-ticker" id="site-alert-preview" aria-hidden="true">
          <div class="site-alert-track">
            <span class="site-alert-message" id="site-alert-preview-message"></span>
            <span class="site-alert-message" id="site-alert-preview-copy" aria-hidden="true"></span>
          </div>
        </div>
        <p class="page-sub muted site-alert-preview-plain"></p>
      </div>
    </div>`;

  paintLiveCurrent(root);
  paintDraftPreview(root, draft);
  wire(root, opts, mountId);
}

/**
 * @param {HTMLElement} root
 */
function syncDraftFromForm(root) {
  alertUi.draft = readDraftFromForm(root);
  alertUi.dirty = true;
  paintDraftPreview(root, alertUi.draft);
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 * @param {number} mountId
 */
function wire(root, opts, mountId) {
  const stillMounted = () => mountId === alertUi.mountId && root.querySelector("[data-site-alert-root]");

  const draftInputs = [
    "#site-alert-text",
    "#site-alert-prefix",
    "#site-alert-suffix",
    "#site-alert-speed",
    "#site-alert-bg",
    "#site-alert-fg",
    "#site-alert-accent",
    "#site-alert-font",
    "#site-alert-weight",
    "#site-alert-transform",
  ];
  for (const sel of draftInputs) {
    root.querySelector(sel)?.addEventListener("input", () => syncDraftFromForm(root));
    root.querySelector(sel)?.addEventListener("change", () => syncDraftFromForm(root));
  }

  root.querySelector("#site-alert-reload")?.addEventListener("click", () => {
    reload(root, opts).catch(() => {});
  });

  root.querySelector("#site-alert-publish")?.addEventListener("click", () => {
    publish(root, opts).catch(() => {});
  });

  root.querySelector("#site-alert-turn-off")?.addEventListener("click", () => {
    turnOff(root, opts).catch(() => {});
  });

  root.querySelectorAll("[data-alert-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-alert-theme");
      const theme = ALERT_THEME_PRESETS.find((t) => t.id === id);
      if (!theme) return;
      syncDraftFromForm(root);
      alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, ...theme.settings });
      alertUi.dirty = true;
      alertUi.status = `Applied ${theme.name} look — message unchanged.`;
      if (stillMounted()) paint(root, opts);
    });
  });

  root.querySelectorAll("[data-alert-message]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-alert-message");
      const preset = ALERT_MESSAGE_PRESETS.find((t) => t.id === id);
      if (!preset) return;
      syncDraftFromForm(root);
      alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, ...preset.settings });
      alertUi.dirty = true;
      alertUi.status = `Applied ${preset.name} wording — look unchanged.`;
      if (stillMounted()) paint(root, opts);
    });
  });

  root.querySelector("#site-alert-text-preset")?.addEventListener("change", (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.target);
    const preset = alertUi.draft.text_presets.find((p) => p.name === select.value);
    if (!preset) return;
    alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, ...preset.settings });
    if (stillMounted()) paint(root, opts);
  });

  root.querySelector("#site-alert-look-preset")?.addEventListener("change", (event) => {
    const select = /** @type {HTMLSelectElement} */ (event.target);
    const preset = alertUi.draft.appearance_presets.find((p) => p.name === select.value);
    if (!preset) return;
    alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, ...preset.settings });
    if (stillMounted()) paint(root, opts);
  });

  root.querySelector("#site-alert-save-text-preset")?.addEventListener("click", () => {
    syncDraftFromForm(root);
    const nameInput = /** @type {HTMLInputElement | null} */ (root.querySelector("#site-alert-text-preset-name"));
    const name = String(nameInput?.value || "").trim().slice(0, 48);
    if (!name) {
      alertUi.status = "Enter a name to save a text preset.";
      paint(root, opts);
      return;
    }
    const settings = {
      text: alertUi.draft.text,
      prefix_text: alertUi.draft.prefix_text,
      suffix_text: alertUi.draft.suffix_text,
    };
    const next = alertUi.draft.text_presets.filter((p) => p.name !== name);
    next.push({ name, settings });
    alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, text_presets: next });
    alertUi.status = `Saved text preset “${name}”. Publish to keep it on the server.`;
    if (nameInput) nameInput.value = "";
    paint(root, opts);
  });

  root.querySelector("#site-alert-save-look-preset")?.addEventListener("click", () => {
    syncDraftFromForm(root);
    const nameInput = /** @type {HTMLInputElement | null} */ (root.querySelector("#site-alert-look-preset-name"));
    const name = String(nameInput?.value || "").trim().slice(0, 48);
    if (!name) {
      alertUi.status = "Enter a name to save a look preset.";
      paint(root, opts);
      return;
    }
    const settings = {
      speed_seconds: alertUi.draft.speed_seconds,
      background_color: alertUi.draft.background_color,
      text_color: alertUi.draft.text_color,
      accent_color: alertUi.draft.accent_color,
      font_family: alertUi.draft.font_family,
      text_transform: alertUi.draft.text_transform,
      font_weight: alertUi.draft.font_weight,
    };
    const next = alertUi.draft.appearance_presets.filter((p) => p.name !== name);
    next.push({ name, settings });
    alertUi.draft = normalizeSiteAlert({ ...alertUi.draft, appearance_presets: next });
    alertUi.status = `Saved look preset “${name}”. Publish to keep it on the server.`;
    if (nameInput) nameInput.value = "";
    paint(root, opts);
  });
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 */
async function reload(root, opts) {
  if (root.querySelector("#site-alert-text")) syncDraftFromForm(root);
  alertUi.status = "Reloading…";
  paint(root, opts);
  await ensureLoaded(opts, { force: true, replaceDraft: true });
  if (root.querySelector("[data-site-alert-root]")) paint(root, opts);
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 */
async function publish(root, opts) {
  syncDraftFromForm(root);
  if (!String(alertUi.draft.text || "").trim()) {
    alertUi.status = "Add alert text before publishing.";
    paint(root, opts);
    return;
  }

  alertUi.busy = true;
  alertUi.error = "";
  alertUi.status = "Publishing…";
  paint(root, opts);
  try {
    const client = await opts.onRequestClient();
    const result = await saveSiteAlert(client, {
      ...alertUi.draft,
      enabled: true,
      alert_published: true,
    });
    alertUi.published = result.settings;
    alertUi.draft = normalizeSiteAlert(result.settings);
    alertUi.updated_at = result.updated_at;
    alertUi.dirty = false;
    alertUi.status = "Alert published and live for all users.";
  } catch (error) {
    alertUi.error = error?.message || "Publish failed.";
    alertUi.status = "Publish failed.";
  } finally {
    alertUi.busy = false;
    paint(root, opts);
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient> }} opts
 */
async function turnOff(root, opts) {
  syncDraftFromForm(root);
  alertUi.busy = true;
  alertUi.error = "";
  alertUi.status = "Turning off…";
  paint(root, opts);
  try {
    const client = await opts.onRequestClient();
    const result = await saveSiteAlert(client, {
      ...alertUi.draft,
      enabled: false,
      alert_published: false,
    });
    alertUi.published = result.settings;
    alertUi.draft = normalizeSiteAlert(result.settings);
    alertUi.updated_at = result.updated_at;
    alertUi.dirty = false;
    alertUi.status = "Alert turned off. Visitors will not see a banner.";
  } catch (error) {
    alertUi.error = error?.message || "Turn off failed.";
    alertUi.status = "Turn off failed.";
  } finally {
    alertUi.busy = false;
    paint(root, opts);
  }
}

/**
 * @param {HTMLElement} root
 * @param {{ onRequestClient: () => Promise<import("@supabase/supabase-js").SupabaseClient>, busy?: boolean }} opts
 */
export function mountSiteAlertPage(root, opts) {
  // Avoid wiping in-progress edits when the parent app re-renders this view.
  if (root.querySelector("[data-site-alert-root]") && alertUi.loaded && !alertUi.busy) {
    paintLiveCurrent(root);
    return;
  }

  if (root.querySelector("#site-alert-text")) {
    try {
      alertUi.draft = readDraftFromForm(root);
      alertUi.dirty = true;
    } catch {
      /* ignore */
    }
  }

  paint(root, opts);

  if (!alertUi.loaded) {
    ensureLoaded(opts, { replaceDraft: !alertUi.dirty }).then(() => {
      if (root.querySelector("[data-site-alert-root]")) paint(root, opts);
    });
  }
}
