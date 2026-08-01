import { fmtDate, fmtInt, fmtNum, fmtPct, fmtRecord, pctTone } from "./format.js";
import { buildTeamProfile, teamNamesFromGames } from "../analytics/teamDetail.js";

/** @type {string | null} */
let selectedTeamName = null;

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {number | null | undefined} n @param {number} [digits] */
function fmtKAvg(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** @param {number | null | undefined} n */
function fmtSigned(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(3);
  return n > 0 ? `+${abs}` : n < 0 ? `-${abs}` : abs;
}

/**
 * @param {string} label
 * @param {string} value
 * @param {string} sub
 * @param {string} [tone]
 * @param {{ rate?: number, pctScale?: "win"|"hit" }} [opts]
 */
function kpiCard(label, value, sub, tone = "", opts = {}) {
  const rate = opts.rate;
  const pctScale = opts.pctScale || "win";
  const bucket = typeof rate === "number" ? pctTone(rate, pctScale) : "";
  const valueClass = bucket ? `kpi-value pct-${bucket}` : "kpi-value";
  return `
    <div class="kpi-card ${tone ? `tone-${tone}` : ""}">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <div class="${valueClass}">${escapeHtml(value)}</div>
      <div class="kpi-sub">${escapeHtml(sub)}</div>
    </div>`;
}

/** @param {string} value */
function outcomeBadge(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "yes" || v === "win") return `<span class="pct-value pct-good">Win</span>`;
  if (v === "no" || v === "loss") return `<span class="pct-value pct-bad">Loss</span>`;
  return escapeHtml(value || "—");
}

/**
 * @param {string[]} options
 * @param {string | null} selected
 */
function teamSelectHtml(options, selected) {
  const selectedValue = selected || "";
  const listItems = options
    .map(
      (name, index) =>
        `<li class="pitcher-combobox-option" role="option" data-value="${escapeHtml(name)}" id="team-opt-${index}">${escapeHtml(name)}</li>`
    )
    .join("");
  return `
    <div class="pitcher-select-field pitcher-combobox team-combobox">
      <label class="sr-only" for="team-select">Select team</label>
      <input
        id="team-select"
        type="search"
        role="combobox"
        class="chart-period-select pitcher-select"
        value="${escapeHtml(selectedValue)}"
        placeholder="Select a team…"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        aria-expanded="false"
        aria-controls="team-select-list"
        aria-haspopup="listbox"
      />
      <ul id="team-select-list" class="pitcher-combobox-list" role="listbox" hidden>${listItems}</ul>
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {() => void} onChange
 */
function wireTeamSelect(root, onChange) {
  const box = /** @type {HTMLElement | null} */ (root.querySelector(".team-combobox"));
  const input = /** @type {HTMLInputElement | null} */ (root.querySelector("#team-select"));
  const list = /** @type {HTMLElement | null} */ (root.querySelector("#team-select-list"));
  if (!box || !input || !list || box.dataset.teamWired === "1") return;
  box.dataset.teamWired = "1";

  const allOptions = [...list.querySelectorAll("[data-value]")].map((el) => ({
    el: /** @type {HTMLElement} */ (el),
    value: el.getAttribute("data-value") || "",
  }));

  /** @type {number} */
  let activeIndex = -1;

  function commit(value) {
    const next = String(value || "").trim() || null;
    if (next === selectedTeamName) {
      input.value = next || "";
      close();
      return;
    }
    selectedTeamName = next;
    onChange();
  }

  function open() {
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    box.classList.add("is-open");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    box.classList.remove("is-open");
    activeIndex = -1;
    allOptions.forEach(({ el }) => el.classList.remove("is-active"));
  }

  /** @param {string} query */
  function filter(query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    activeIndex = -1;
    allOptions.forEach(({ el, value }) => {
      const match = !q || value.toLowerCase().includes(q);
      el.hidden = !match;
      el.classList.remove("is-active");
      if (match) visible += 1;
    });
    return visible;
  }

  /** @returns {HTMLElement[]} */
  function visibleOptions() {
    return allOptions.filter(({ el }) => !el.hidden).map(({ el }) => el);
  }

  /** @param {number} index */
  function setActive(index) {
    const items = visibleOptions();
    allOptions.forEach(({ el }) => el.classList.remove("is-active"));
    if (!items.length) {
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    activeIndex = ((index % items.length) + items.length) % items.length;
    const active = items[activeIndex];
    active.classList.add("is-active");
    if (active.id) input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", () => {
    filter(input.value);
    open();
  });

  input.addEventListener("input", () => {
    const visible = filter(input.value);
    open();
    if (visible) setActive(0);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (list.hidden) {
        filter(input.value);
        open();
      }
      setActive(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) {
        filter(input.value);
        open();
      }
      setActive(activeIndex <= 0 ? visibleOptions().length - 1 : activeIndex - 1);
      return;
    }
    if (event.key === "Enter") {
      const items = visibleOptions();
      if (!list.hidden && activeIndex >= 0 && items[activeIndex]) {
        event.preventDefault();
        commit(items[activeIndex].getAttribute("data-value") || "");
        return;
      }
      const typed = input.value.trim().toLowerCase();
      const exact = allOptions.find(({ value }) => value.toLowerCase() === typed);
      if (exact) {
        event.preventDefault();
        commit(exact.value);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.value = selectedTeamName || "";
      close();
      input.blur();
    }
  });

  list.addEventListener("mousedown", (event) => {
    const option = event.target instanceof HTMLElement ? event.target.closest("[data-value]") : null;
    if (!(option instanceof HTMLElement)) return;
    event.preventDefault();
    commit(option.getAttribute("data-value") || "");
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (box.contains(document.activeElement)) return;
      const typed = input.value.trim();
      if (!typed) {
        if (selectedTeamName) commit(null);
        else {
          input.value = "";
          close();
        }
        return;
      }
      const exact = allOptions.find(({ value }) => value.toLowerCase() === typed.toLowerCase());
      if (exact) {
        if (exact.value !== selectedTeamName) commit(exact.value);
        else {
          input.value = exact.value;
          close();
        }
        return;
      }
      input.value = selectedTeamName || "";
      close();
    }, 120);
  });
}

/**
 * @param {ReturnType<typeof buildTeamProfile>} profile
 * @param {{ options: string[], selected: string | null }} select
 */
function teamDetailHtml(profile, select) {
  if (!select.selected) {
    return `
      <div class="card pitcher-detail pitcher-detail--empty" id="team-detail">
        <div class="pitcher-detail-empty">
          <p class="pitcher-detail-empty-body">Select a team to load analytics.</p>
        </div>
      </div>`;
  }

  if (!profile) {
    return `
      <div class="card pitcher-detail pitcher-detail--empty" id="team-detail">
        <div class="pitcher-detail-empty">
          <p class="pitcher-detail-empty-title">${escapeHtml(select.selected)}</p>
          <p class="pitcher-detail-empty-body">No settled starts for this team in the current date filter.</p>
        </div>
      </div>`;
  }

  const range =
    profile.dateStart || profile.dateEnd
      ? `${fmtDate(profile.dateStart)} – ${fmtDate(profile.dateEnd)}`
      : "Settled sample";
  const best = profile.bestStrategy;
  const notes = (profile.notes || [])
    .map(
      (note) => `
      <li class="pitcher-note-item pitcher-note-item--${escapeHtml(note.impact)}">
        <span class="pitcher-note-kicker">${escapeHtml(note.title)}</span>
        <span class="pitcher-note-copy">${escapeHtml(note.body)}</span>
      </li>`
    )
    .join("");

  const strategyCards = (profile.strategies || [])
    .map((s) => {
      const isBest = best && s.id === best.id;
      return kpiCard(
        isBest ? `${s.label} · Best` : s.label,
        fmtPct(s.stats.winRate),
        fmtRecord(s.stats),
        s.tone,
        { rate: s.stats.winRate }
      );
    })
    .join("");

  const pitcherRows = (profile.pitchers || [])
    .map(
      (row) => `<tr>
        <td class="col-text">${escapeHtml(row.pitcher)}</td>
        <td class="num">${escapeHtml(fmtInt(row.games))}</td>
        <td class="num">${escapeHtml(fmtKAvg(row.avgK))}</td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.dk.winRate, "win")}">${escapeHtml(fmtPct(row.dk.winRate))}</span></td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.fd.winRate, "win")}">${escapeHtml(fmtPct(row.fd.winRate))}</span></td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.ek0.winRate, "win")}">${escapeHtml(fmtPct(row.ek0.winRate))}</span></td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.ek1.winRate, "win")}">${escapeHtml(fmtPct(row.ek1.winRate))}</span></td>
      </tr>`
    )
    .join("");

  const homeAwayRows = (profile.homeAway || [])
    .map(
      (row) => `<tr>
        <td class="col-text">${escapeHtml(row.side)}</td>
        <td class="num">${escapeHtml(fmtInt(row.games))}</td>
        <td class="num">${escapeHtml(fmtKAvg(row.avgK))}</td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.dk.winRate, "win")}">${escapeHtml(fmtPct(row.dk.winRate))}</span></td>
        <td class="num">${escapeHtml(fmtRecord(row.dk))}</td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.ek1.winRate, "win")}">${escapeHtml(fmtPct(row.ek1.winRate))}</span></td>
        <td class="num">${escapeHtml(fmtRecord(row.ek1))}</td>
      </tr>`
    )
    .join("");

  const opponentRows = (profile.opponents || [])
    .slice(0, 10)
    .map((row) => {
      const delta =
        row.delta == null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}`;
      const deltaTone =
        row.delta == null ? "" : row.delta >= 0.45 ? "is-up" : row.delta <= -0.45 ? "is-down" : "";
      return `<tr>
        <td class="col-text">${escapeHtml(row.opponent)}</td>
        <td class="num">${escapeHtml(fmtInt(row.games))}</td>
        <td class="num">${escapeHtml(fmtKAvg(row.avgK))}</td>
        <td class="num"><span class="pitcher-delta ${deltaTone}">${escapeHtml(delta)}</span></td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.dk.winRate, "win")}">${escapeHtml(fmtPct(row.dk.winRate))}</span></td>
        <td class="num col-pct"><span class="pct-value pct-${pctTone(row.ek1.winRate, "win")}">${escapeHtml(fmtPct(row.ek1.winRate))}</span></td>
      </tr>`;
    })
    .join("");

  const recentRows = (profile.recent || [])
    .map((g) => {
      const ek0Hit =
        g.ensemble != null && g.actual != null ? g.actual >= Math.floor(g.ensemble) : null;
      const ek1Hit =
        g.ensemble != null && g.actual != null ? g.actual >= Math.floor(g.ensemble) - 1 : null;
      return `<tr>
        <td class="col-text">${escapeHtml(fmtDate(g.date))}</td>
        <td class="col-text">${escapeHtml(g.pitcher || "—")}</td>
        <td class="col-text">${escapeHtml(g.opponent || "—")}</td>
        <td class="col-center">${escapeHtml(g.homeAway || "—")}</td>
        <td class="num">${escapeHtml(g.actual != null ? fmtNum(g.actual, 0) : "—")}</td>
        <td class="num">${escapeHtml(g.ensemble != null ? fmtNum(g.ensemble, 1) : "—")}</td>
        <td class="col-center">${outcomeBadge(g.dkCorrect)}</td>
        <td class="col-center">${outcomeBadge(g.fdCorrect)}</td>
        <td class="col-center">${ek0Hit == null ? "—" : outcomeBadge(ek0Hit ? "Win" : "Loss")}</td>
        <td class="col-center">${ek1Hit == null ? "—" : outcomeBadge(ek1Hit ? "Win" : "Loss")}</td>
      </tr>`;
    })
    .join("");

  const envSub =
    profile.avgDelta == null
      ? "staff avg Ks"
      : `${profile.avgDelta > 0 ? "+" : ""}${profile.avgDelta.toFixed(1)} vs overall`;

  return `
    <div class="pitcher-detail" id="team-detail">
      <div class="pitcher-detail-hero">
        <div class="pitcher-detail-identity">
          <h3 class="pitcher-detail-name">${escapeHtml(profile.team)}</h3>
          <p class="pitcher-detail-meta">${escapeHtml(fmtInt(profile.pitcherCount))} pitchers · ${escapeHtml(fmtInt(profile.starts))} starts · ${escapeHtml(range)}</p>
        </div>
        <div class="kpi-grid pitcher-detail-kpis">
          ${kpiCard("Avg Ks", fmtKAvg(profile.avgActual), envSub, "model-pitchiq")}
          ${kpiCard("League avg", fmtKAvg(profile.leagueAvgK), "all games in filter", "model-pitchiq")}
          ${kpiCard("PitchIQ avg", fmtKAvg(profile.avgEnsemble), "projection average", "model-pitchiq")}
          ${kpiCard("DK line avg", fmtKAvg(profile.avgDkLine), "DraftKings O/U", "book-dk")}
          ${kpiCard("MAE", profile.mae != null ? fmtNum(profile.mae, 2) : "—", "mean abs error (Ks)", "model-pitchiq")}
          ${kpiCard("Bias", fmtSigned(profile.bias), profile.bias != null && profile.bias > 0 ? "over-projects" : profile.bias != null && profile.bias < 0 ? "under-projects" : "signed error", "model-pitchiq")}
        </div>
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Analyst notes</h3>
        ${
          notes
            ? `<ul class="pitcher-notes-list">${notes}</ul>`
            : `<p class="page-sub muted" style="margin:0;">Not enough settled sample yet for team notes.</p>`
        }
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Strategy performance</h3>
        <div class="kpi-grid pitcher-strat-grid">${strategyCards}</div>
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Staff pitchers</h3>
        <div class="table-shell table-theme-models">
          <div class="table-scroll pitcher-detail-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-text">Pitcher</th>
                  <th class="num">Starts</th>
                  <th class="num">Avg K</th>
                  <th class="num col-pct">DK %</th>
                  <th class="num col-pct">FD %</th>
                  <th class="num col-pct">EK0 %</th>
                  <th class="num col-pct">EK-1 %</th>
                </tr>
              </thead>
              <tbody>${pitcherRows || `<tr><td class="col-center mini-empty" colspan="7">No pitcher sample</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card-grid pitcher-detail-split" style="margin-top:1.25rem;">
        <div class="card">
          <h3 class="card-title">Home / Away</h3>
          <div class="table-shell table-theme-models">
            <div class="table-scroll pitcher-detail-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-text">Side</th>
                    <th class="num">Starts</th>
                    <th class="num">Avg K</th>
                    <th class="num col-pct">DK %</th>
                    <th class="num">DK</th>
                    <th class="num col-pct">EK-1 %</th>
                    <th class="num">EK-1</th>
                  </tr>
                </thead>
                <tbody>${homeAwayRows || `<tr><td class="col-center mini-empty" colspan="7">No split data</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Vs opponents</h3>
          <div class="table-shell table-theme-models">
            <div class="table-scroll pitcher-detail-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-text">Opponent</th>
                    <th class="num">N</th>
                    <th class="num">Avg K</th>
                    <th class="num">Δ vs staff</th>
                    <th class="num col-pct">DK %</th>
                    <th class="num col-pct">EK-1 %</th>
                  </tr>
                </thead>
                <tbody>${opponentRows || `<tr><td class="col-center mini-empty" colspan="6">No opponent sample</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Recent starts</h3>
        <div class="table-shell table-theme-models">
          <div class="table-scroll pitcher-detail-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="col-text">Date</th>
                  <th class="col-text">Pitcher</th>
                  <th class="col-text">Opp</th>
                  <th class="col-center">H/A</th>
                  <th class="num">Actual</th>
                  <th class="num">PitchIQ</th>
                  <th class="col-center">DK</th>
                  <th class="col-center">FD</th>
                  <th class="col-center">EK0</th>
                  <th class="col-center">EK-1</th>
                </tr>
              </thead>
              <tbody>${recentRows || `<tr><td class="col-center mini-empty" colspan="10">No starts</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {import("../data/games.js").GameRow[]} games
 */
export function mountTeamsPage(root, games = []) {
  const list = games || [];
  const options = teamNamesFromGames(list);
  if (selectedTeamName && !options.includes(selectedTeamName)) {
    selectedTeamName = null;
  }

  function paint() {
    if (selectedTeamName && !options.includes(selectedTeamName)) {
      selectedTeamName = null;
    }
    const profile = selectedTeamName ? buildTeamProfile(list, selectedTeamName) : null;
    root.innerHTML = `
      <div class="book-theme-models">
        <div class="page-header book-page-header book-models">
          <div class="admin-page-head pitcher-page-head">
            <h2 class="page-title">Team</h2>
            ${teamSelectHtml(options, selectedTeamName)}
          </div>
        </div>
        ${teamDetailHtml(profile, { options, selected: selectedTeamName })}
      </div>`;
    wireTeamSelect(root, paint);
  }

  paint();
}
