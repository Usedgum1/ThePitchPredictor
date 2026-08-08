import { fmtDate, fmtInt, fmtNum, fmtPct, fmtRecord, pctTone } from "./format.js";
import { getChartPeriod, getCustomerFluxPeriod, getPageViewsPeriod, renderBookWinChart, renderModelHitChart, renderMonthlyWinChart, renderPageViewsChart, renderSignupChart, renderSubFluxChart, setChartPeriod, setCustomerFluxPeriod, setPageViewsPeriod } from "./charts.js";
import { navTitle } from "./nav.js";
import { mountEmailJobsPanel } from "./emailJobs.js";
import { mountSiteAlertPage } from "./siteAlert.js";
import { mountMediaCreatorPage } from "./mediaCreator.js";
import { mountGamesPage } from "./gamesView.js";
import { mountUmpsPage } from "./umpsView.js";
import { mountTeamsPage } from "./teamsView.js";
import { buildPitcherProfile } from "../analytics/pitcherDetail.js";
import { resolveCaptureLabel, resolveCaptureRoot } from "../data/mediaCreator.js";

/** Rows shown on ranked tier-list tables (best/worst pitchers, playbook). */
let tierListLimit = 10;
/** @type {string | null} */
let selectedPitcherName = null;
/**
 * @param {string[]} headers
 * @param {(string|number)[][]} rows
 * @param {{ formats?: Record<number, "pct"|"num"|"int"|"book"|"text"|"record">, theme?: string, pctScale?: "win"|"hit", mediaLabel?: string, tierList?: boolean }} [opts]
 */
function tableHtml(headers, rows, opts = {}) {
  const themeClass = opts.theme ? ` table-theme-${opts.theme}` : "";
  const pctScale = opts.pctScale || "win";
  const mediaLabel = opts.mediaLabel || "";
  const tierList = Boolean(opts.tierList);
  const displayRows = tierList ? rows.slice(0, tierListLimit) : rows;

  /** @param {string | undefined} format @param {number} index */
  function columnClass(format, index) {
    if (format === "book") return "col-center";
    if (format === "text") return "col-text";
    if (format === "pct") return "num col-pct";
    if (format === "num" || format === "int" || format === "record") return "num";
    if (index === 0) return "col-text";
    return "num";
  }

  const head = headers
    .map((h, i) => {
      const format = opts.formats?.[i];
      return `<th class="${columnClass(format, i)}">${escapeHtml(h)}</th>`;
    })
    .join("");

  const body = displayRows
    .map((row) => {
      const cells = row
        .map((value, i) => {
          const format = opts.formats?.[i];
          const cls = columnClass(format, i);
          if (format === "book") {
            const book = String(value ?? "").toUpperCase();
            const chip = book === "DK" ? "book-dk" : book === "FD" ? "book-fd" : "";
            return `<td class="${cls}"><span class="book-chip ${chip}">${escapeHtml(book || "—")}</span></td>`;
          }
          let text = String(value ?? "—");
          if (format === "pct" && typeof value === "number") {
            const tone = pctTone(value, pctScale);
            text = fmtPct(value);
            return `<td class="${cls}"><span class="pct-value pct-${tone}">${escapeHtml(text)}</span></td>`;
          }
          if (format === "num" && typeof value === "number") text = fmtNum(value);
          if (format === "int" && typeof value === "number") text = fmtInt(value);
          return `<td class="${cls}">${escapeHtml(text)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="media-capture-block" ${mediaLabel ? `data-media-label="${escapeHtml(mediaLabel)}"` : ""}>
      <div class="media-capture-toolbar${tierList ? " has-tier-limit" : ""}">
        ${tierList ? tierLimitControlHtml() : ""}
        <button type="button" class="media-send-btn" title="Send this table to Media Creator as an image" aria-label="Send this table to Media Creator as an image">
          <span class="media-send-glyph" aria-hidden="true">⧉</span>
        </button>
      </div>
      <div class="table-shell${themeClass}">
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr>${head}</tr></thead>
            <tbody>${body || `<tr><td class="col-center mini-empty" colspan="${headers.length}">No rows</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function tierLimitControlHtml() {
  return `<div class="tier-limit-menu">
    <button type="button" class="tier-limit-btn" title="Rows to show" aria-haspopup="menu" aria-expanded="false" aria-label="Rows to show">
      <span class="tier-limit-glyph">${tierListLimit}</span>
    </button>
    <div class="tier-limit-panel" hidden role="menu">
      <button type="button" class="tier-limit-option${tierListLimit === 5 ? " is-active" : ""}" role="menuitem" data-tier-limit="5">Show 5</button>
      <button type="button" class="tier-limit-option${tierListLimit === 10 ? " is-active" : ""}" role="menuitem" data-tier-limit="10">Show 10</button>
    </div>
  </div>`;
}

/**
 * @param {import("../data/games.js").GameRow[]} games
 * @returns {string[]}
 */
function pitcherNamesFromGames(games) {
  const names = [
    ...new Set(
      (games || [])
        .map((g) => String(g.pitcher || "").trim())
        .filter(Boolean)
    ),
  ];
  names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return names;
}

/**
 * @param {string[]} options
 * @param {string | null} selected
 */
function pitcherSelectHtml(options, selected) {
  const selectedValue = selected || "";
  const listItems = options
    .map(
      (name, index) =>
        `<li class="pitcher-combobox-option" role="option" data-value="${escapeHtml(name)}" id="pitcher-opt-${index}">${escapeHtml(name)}</li>`
    )
    .join("");
  return `
    <div class="pitcher-select-field pitcher-combobox">
      <label class="sr-only" for="pitcher-select">Select pitcher</label>
      <input
        id="pitcher-select"
        type="search"
        role="combobox"
        class="chart-period-select pitcher-select"
        value="${escapeHtml(selectedValue)}"
        placeholder="Select a pitcher…"
        autocomplete="off"
        spellcheck="false"
        aria-autocomplete="list"
        aria-expanded="false"
        aria-controls="pitcher-select-list"
        aria-haspopup="listbox"
      />
      <ul id="pitcher-select-list" class="pitcher-combobox-list" role="listbox" hidden>${listItems}</ul>
    </div>`;
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} title
 * @param {object[]} rows
 * @param {"best"|"worst"} tone
 */
function miniPitcherTable(title, rows, tone = "best") {
  const key = mapKey(title);
  const shown = rows.slice(0, tierListLimit);
  const body = shown
    .map((r, i) => {
      const stats = r[key];
      const rate = typeof stats.winRate === "number" ? stats.winRate : 0;
      const bucket = pctTone(rate, "win");
      return `<tr class="mini-row">
        <td class="mini-rank"><span class="rank-badge">${i + 1}</span></td>
        <td class="mini-name">${escapeHtml(r.pitcher)}</td>
        <td class="mini-rate"><span class="rate-chip pct-value pct-${bucket}">${fmtPct(rate)}</span></td>
        <td class="mini-record">${stats.wins}W–${stats.losses}L</td>
      </tr>`;
    })
    .join("");
  return `<div class="mini-table-card media-capture-block tone-${tone} strategy-${key}" data-media-label="${escapeHtml(title)}">
    <div class="mini-table-head">
      ${tierLimitControlHtml()}
      <span class="mini-strategy">${escapeHtml(title)}</span>
      <button type="button" class="media-send-btn" title="Send this table to Media Creator as an image" aria-label="Send this table to Media Creator as an image">
        <span class="media-send-glyph" aria-hidden="true">⧉</span>
      </button>
    </div>
    <div class="table-shell">
      <div class="table-scroll">
        <table class="data-table mini">
          <thead><tr>
            <th class="col-center">#</th>
            <th class="col-text">Pitcher</th>
            <th class="num">Win%</th>
            <th class="num">Record</th>
          </tr></thead>
          <tbody>${body || `<tr><td colspan="4" class="col-center mini-empty">No qualifiers</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function mapKey(title) {
  const m = { "DK O/U": "dk", "FD O/U": "fd", EK0: "ek0", "EK-1": "ek1" };
  return m[title] || "ek1";
}

/**
 * Compact strategy table for teams or umpires (same shape as pitcher minis).
 * @param {string} title
 * @param {object[]} rows
 * @param {"best"|"worst"} tone
 * @param {"team"|"ump"} kind
 */
function miniContextTable(title, rows, tone = "best", kind = "team") {
  const key = mapKey(title);
  const shown = rows.slice(0, tierListLimit);
  const nameHeader = kind === "ump" ? "Umpire" : "Team";
  const body = shown
    .map((r, i) => {
      const stats = r[key] || {};
      const rate = typeof stats.winRate === "number" ? stats.winRate : 0;
      const bucket = pctTone(rate, "win");
      return `<tr class="mini-row">
        <td class="mini-rank"><span class="rank-badge">${i + 1}</span></td>
        <td class="mini-name">${escapeHtml(r.name)}</td>
        <td class="mini-rate"><span class="rate-chip pct-value pct-${bucket}">${fmtPct(rate)}</span></td>
        <td class="mini-record">${stats.wins ?? 0}W–${stats.losses ?? 0}L</td>
      </tr>`;
    })
    .join("");
  return `<div class="mini-table-card media-capture-block tone-${tone} strategy-${key}" data-media-label="${escapeHtml(title)}">
    <div class="mini-table-head">
      ${tierLimitControlHtml()}
      <span class="mini-strategy">${escapeHtml(title)}</span>
      <button type="button" class="media-send-btn" title="Send this table to Media Creator as an image" aria-label="Send this table to Media Creator as an image">
        <span class="media-send-glyph" aria-hidden="true">⧉</span>
      </button>
    </div>
    <div class="table-shell">
      <div class="table-scroll">
        <table class="data-table mini">
          <thead><tr>
            <th class="col-center">#</th>
            <th class="col-text">${escapeHtml(nameHeader)}</th>
            <th class="num">Win%</th>
            <th class="num">Record</th>
          </tr></thead>
          <tbody>${body || `<tr><td colspan="4" class="col-center mini-empty">No qualifiers</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  </div>`;
}

/** @param {HTMLElement} root @param {object} results */
function renderDashboard(root, results) {
  const s = results.summary;
  const teams = results.teams || {
    best: { dk: [], fd: [], ek0: [], ek1: [] },
    worst: { dk: [], fd: [], ek0: [], ek1: [] },
    minSample: 8,
  };
  const umps = results.umpires || {
    best: { dk: [], fd: [], ek0: [], ek1: [] },
    worst: { dk: [], fd: [], ek0: [], ek1: [] },
    minSample: 8,
  };
  const teamMin = teams.minSample || 8;
  const umpMin = umps.minSample || 8;
  root.innerHTML = `
    <div class="page-header">
      <h2 class="page-title">Dashboard</h2>
      <p class="page-sub">${fmtInt(s.games)} games · ${fmtDate(s.dateStart)} → ${fmtDate(s.dateEnd)}</p>
    </div>
    <div class="kpi-grid">
      ${kpiCard("DK O/U", fmtPct(s.dk.winRate), fmtRecord(s.dk), "book-dk", { rate: s.dk.winRate })}
      ${kpiCard("FD O/U", fmtPct(s.fd.winRate), fmtRecord(s.fd), "book-fd", { rate: s.fd.winRate })}
      ${kpiCard("EK0", fmtPct(s.ek0.winRate), fmtRecord(s.ek0), "book-ek0", { rate: s.ek0.winRate })}
      ${kpiCard("EK-1", fmtPct(s.ek1.winRate), fmtRecord(s.ek1), "book-ek1", { rate: s.ek1.winRate })}
    </div>
    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <div class="chart-card-head">
          <h3 class="card-title">Win rates over time</h3>
          <label class="chart-period-label">
            <span class="sr-only">Chart period</span>
            <select id="chart-period" class="chart-period-select" aria-label="Chart period">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly" selected>Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
        </div>
        <div class="chart-panel"><canvas id="monthly-win-chart"></canvas></div>
      </div>
    </div>
    <section class="leaderboard-block tone-best">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Best pitchers by strategy</h3>
        <span class="leaderboard-hint">top ${tierListLimit} · ≥5 starts</span>
      </div>
      <div class="mini-table-grid">
        ${miniPitcherTable("DK O/U", results.pitchers.best.dk, "best")}
        ${miniPitcherTable("FD O/U", results.pitchers.best.fd, "best")}
        ${miniPitcherTable("EK0", results.pitchers.best.ek0, "best")}
        ${miniPitcherTable("EK-1", results.pitchers.best.ek1, "best")}
      </div>
    </section>
    <section class="leaderboard-block tone-worst">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Worst pitchers by strategy</h3>
        <span class="leaderboard-hint">bottom ${tierListLimit} · ≥5 starts</span>
      </div>
      <div class="mini-table-grid">
        ${miniPitcherTable("DK O/U", results.pitchers.worst.dk, "worst")}
        ${miniPitcherTable("FD O/U", results.pitchers.worst.fd, "worst")}
        ${miniPitcherTable("EK0", results.pitchers.worst.ek0, "worst")}
        ${miniPitcherTable("EK-1", results.pitchers.worst.ek1, "worst")}
      </div>
    </section>
    <section class="leaderboard-block tone-best" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Best teams by strategy</h3>
        <span class="leaderboard-hint">top ${tierListLimit} · ≥${teamMin} starts</span>
      </div>
      <div class="mini-table-grid">
        ${miniContextTable("DK O/U", teams.best.dk, "best", "team")}
        ${miniContextTable("FD O/U", teams.best.fd, "best", "team")}
        ${miniContextTable("EK0", teams.best.ek0, "best", "team")}
        ${miniContextTable("EK-1", teams.best.ek1, "best", "team")}
      </div>
    </section>
    <section class="leaderboard-block tone-worst" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Worst teams by strategy</h3>
        <span class="leaderboard-hint">bottom ${tierListLimit} · ≥${teamMin} starts</span>
      </div>
      <div class="mini-table-grid">
        ${miniContextTable("DK O/U", teams.worst.dk, "worst", "team")}
        ${miniContextTable("FD O/U", teams.worst.fd, "worst", "team")}
        ${miniContextTable("EK0", teams.worst.ek0, "worst", "team")}
        ${miniContextTable("EK-1", teams.worst.ek1, "worst", "team")}
      </div>
    </section>
    <section class="leaderboard-block tone-best" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Best umps by strategy</h3>
        <span class="leaderboard-hint">top ${tierListLimit} · ≥${umpMin} games</span>
      </div>
      <div class="mini-table-grid">
        ${miniContextTable("DK O/U", umps.best.dk, "best", "ump")}
        ${miniContextTable("FD O/U", umps.best.fd, "best", "ump")}
        ${miniContextTable("EK0", umps.best.ek0, "best", "ump")}
        ${miniContextTable("EK-1", umps.best.ek1, "best", "ump")}
      </div>
    </section>
    <section class="leaderboard-block tone-worst" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Worst umps by strategy</h3>
        <span class="leaderboard-hint">bottom ${tierListLimit} · ≥${umpMin} games</span>
      </div>
      <div class="mini-table-grid">
        ${miniContextTable("DK O/U", umps.worst.dk, "worst", "ump")}
        ${miniContextTable("FD O/U", umps.worst.fd, "worst", "ump")}
        ${miniContextTable("EK0", umps.worst.ek0, "worst", "ump")}
        ${miniContextTable("EK-1", umps.worst.ek1, "worst", "ump")}
      </div>
    </section>
    <section class="model-win-block">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Model within 1 K</h3>
        <span class="leaderboard-hint">|pred − actual| ≤ 1</span>
      </div>
      <div class="kpi-grid model-win-grid">
        ${kpiCard("PitchIQ K", fmtPct(s.pitchiq.winRate), fmtRecord(s.pitchiq), "model-pitchiq", { rate: s.pitchiq.winRate, pctScale: "hit" })}
        ${kpiCard("Poisson", fmtPct(s.poisson.winRate), fmtRecord(s.poisson), "model-poisson", { rate: s.poisson.winRate, pctScale: "hit" })}
        ${kpiCard("Linear", fmtPct(s.linear.winRate), fmtRecord(s.linear), "model-linear", { rate: s.linear.winRate, pctScale: "hit" })}
        ${kpiCard("Nonlinear", fmtPct(s.nonlinear.winRate), fmtRecord(s.nonlinear), "model-nonlinear", { rate: s.nonlinear.winRate, pctScale: "hit" })}
      </div>
    </section>`;
  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#monthly-win-chart"));
  const periodSelect = /** @type {HTMLSelectElement | null} */ (root.querySelector("#chart-period"));
  const period = getChartPeriod();
  if (periodSelect) periodSelect.value = period;
  const trendRows = results.trends?.[period] || results.monthly;
  if (canvas) renderMonthlyWinChart(canvas, trendRows, period);
  periodSelect?.addEventListener("change", () => {
    const next = /** @type {"daily"|"weekly"|"monthly"|"yearly"} */ (periodSelect.value);
    setChartPeriod(next);
    if (canvas) renderMonthlyWinChart(canvas, results.trends?.[next] || results.monthly, next);
  });
}

/** @param {string} label @param {string} value @param {string} sub @param {string} [tone] @param {{ rate?: number, pctScale?: "win"|"hit" }} [opts] */
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

/**
 * @param {object} row
 * @returns {(string|number)[]}
 */
function bookStatRow(row, labelKey = "label") {
  return [row[labelKey], row.total, row.winRate, fmtRecord(row)];
}

const BOOK_TABLE_FMT = { 1: "int", 2: "pct", 3: "record" };

/**
 * @param {HTMLElement} root
 * @param {object} results
 * @param {{
 *   key: "draftkings"|"fanduel",
 *   title: string,
 *   short: string,
 *   theme: "dk"|"fd",
 *   tone: string,
 *   color: string,
 *   chartId: string,
 * }} cfg
 */
function renderBookPage(root, results, cfg) {
  const book = results[cfg.key];
  if (!book) {
    root.innerHTML = `<div class="page-header"><h2 class="page-title">${escapeHtml(cfg.title)}</h2><p class="page-sub">No ${escapeHtml(cfg.title)} data available.</p></div>`;
    return;
  }
  const o = book.overall;
  const themeClass = `book-theme-${cfg.theme}`;
  const blockClass = `book-${cfg.theme}-block`;
  const headerClass = `book-${cfg.theme}`;
  const tableOpts = { formats: BOOK_TABLE_FMT, theme: cfg.theme };

  root.innerHTML = `
    <div class="${themeClass}">
    <div class="page-header book-page-header ${headerClass}">
      <h2 class="page-title">${escapeHtml(cfg.title)}</h2>
      <p class="page-sub">O/U deep dive · win rate and record only (no odds assumptions)</p>
    </div>
    <div class="kpi-grid">
      ${kpiCard("Win rate", fmtPct(o.winRate), fmtRecord(o), cfg.tone, { rate: o.winRate })}
      ${kpiCard("Sample", fmtInt(o.total), `settled ${cfg.short} bets`, cfg.tone)}
      ${kpiCard("Last 30 days", fmtPct(book.recent30.winRate), fmtRecord(book.recent30), cfg.tone, { rate: book.recent30.winRate })}
      ${kpiCard("Last 7 days", fmtPct(book.recent7.winRate), fmtRecord(book.recent7), cfg.tone, { rate: book.recent7.winRate })}
      ${kpiCard(
        "Over",
        `${fmtInt(book.sides.over.wins)}W-${fmtInt(book.sides.over.losses)}L`,
        `${fmtPct(book.sides.over.winRate)} · ${fmtInt(book.sides.over.total)} bets`,
        cfg.tone,
        { rate: book.sides.over.winRate }
      )}
      ${kpiCard(
        "Under",
        `${fmtInt(book.sides.under.wins)}W-${fmtInt(book.sides.under.losses)}L`,
        `${fmtPct(book.sides.under.winRate)} · ${fmtInt(book.sides.under.total)} bets`,
        cfg.tone,
        { rate: book.sides.under.winRate }
      )}
    </div>

    <section class="model-win-block ${blockClass}" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Playbook</h3>
        <span class="leaderboard-hint">top ${tierListLimit} · ≥40 bets</span>
      </div>
      <div class="card-grid">
        <div class="card">
          <h3 class="card-title">Lean into</h3>
          ${tableHtml(
            ["Segment", "Bets", "Win%", "Record"],
            book.playbook.best.map((r) => bookStatRow(r)),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Fade / caution</h3>
          ${tableHtml(
            ["Segment", "Bets", "Win%", "Record"],
            book.playbook.avoid.map((r) => bookStatRow(r)),
            { ...tableOpts, tierList: true }
          )}
        </div>
      </div>
    </section>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">Monthly ${cfg.short} win rate</h3>
        <div class="chart-panel"><canvas id="${cfg.chartId}"></canvas></div>
      </div>
    </div>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card">
        <h3 class="card-title">Confidence</h3>
        ${tableHtml(
          ["Tier", "Bets", "Win%", "Record"],
          book.confidence.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Line buckets</h3>
        ${tableHtml(
          ["Range", "Bets", "Win%", "Record"],
          book.lineBuckets.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Exact lines</h3>
        ${tableHtml(
          ["Line", "Bets", "Win%", "Record"],
          book.exactLines.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Home / Away</h3>
        ${tableHtml(
          ["Location", "Bets", "Win%", "Record"],
          book.location.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">By PitchIQ projection</h3>
        ${tableHtml(
          ["Proj range", "Bets", "Win%", "Record"],
          book.ensembleRanges.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Volatility (VIX)</h3>
        ${tableHtml(
          ["Tier", "Bets", "Win%", "Record"],
          book.vix.map((r) => bookStatRow(r)),
          tableOpts
        )}
      </div>
    </div>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">Monthly breakdown</h3>
        ${tableHtml(
          ["Month", "Bets", "Win%", "Record"],
          book.monthly.map((r) => [r.month, r.total, r.winRate, fmtRecord(r)]),
          tableOpts
        )}
      </div>
    </div>

    <section class="model-win-block ${blockClass}" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Pitchers by strategy</h3>
        <span class="leaderboard-hint">top/bottom ${tierListLimit} · ≥5 starts</span>
      </div>
      <div class="card-grid">
        <div class="card">
          <h3 class="card-title">Best ${cfg.short} O/U</h3>
          ${tableHtml(
            ["Pitcher", "Bets", "Win%", "Record"],
            book.pitchers.ou.best.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Worst ${cfg.short} O/U</h3>
          ${tableHtml(
            ["Pitcher", "Bets", "Win%", "Record"],
            book.pitchers.ou.worst.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Best EK0</h3>
          ${tableHtml(
            ["Pitcher", "Starts", "Win%", "Record"],
            book.pitchers.ek0.best.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Worst EK0</h3>
          ${tableHtml(
            ["Pitcher", "Starts", "Win%", "Record"],
            book.pitchers.ek0.worst.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Best EK-1</h3>
          ${tableHtml(
            ["Pitcher", "Starts", "Win%", "Record"],
            book.pitchers.ek1.best.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
        <div class="card">
          <h3 class="card-title">Worst EK-1</h3>
          ${tableHtml(
            ["Pitcher", "Starts", "Win%", "Record"],
            book.pitchers.ek1.worst.map((r) => [r.pitcher, r.total, r.winRate, fmtRecord(r)]),
            { ...tableOpts, tierList: true }
          )}
        </div>
      </div>
    </section>
    </div>`;

  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector(`#${cfg.chartId}`));
  if (canvas) {
    renderBookWinChart(
      canvas,
      book.monthly.map((r) => ({ month: r.month, winRate: r.winRate })),
      { label: `${cfg.short} O/U`, color: cfg.color }
    );
  }
}

/** @param {HTMLElement} root @param {object} results */
function renderDraftKings(root, results) {
  renderBookPage(root, results, {
    key: "draftkings",
    title: "DraftKings",
    short: "DK",
    theme: "dk",
    tone: "book-dk",
    color: "#53d337",
    chartId: "dk-win-chart",
  });
}

/** @param {HTMLElement} root @param {object} results */
function renderFanDuel(root, results) {
  renderBookPage(root, results, {
    key: "fanduel",
    title: "FanDuel",
    short: "FD",
    theme: "fd",
    tone: "book-fd",
    color: "#1493ff",
    chartId: "fd-win-chart",
  });
}

/** @param {number | null | undefined} n */
function fmtSigned(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toFixed(3);
  return n > 0 ? `+${abs}` : n < 0 ? `-${abs}` : abs;
}

/**
 * @param {{ ladder: { within: number, winRate: number, wins: number, losses: number, total: number }[] }} row
 * @param {string} label
 * @param {number} games
 */
function withinLadderCells(row, label, games) {
  return [
    label,
    games,
    ...[1, 2, 3, 4, 5].map((n) => row.ladder.find((r) => r.within === n)?.winRate ?? 0),
  ];
}

const WITHIN_LADDER_FMT = { 1: "int", 2: "pct", 3: "pct", 4: "pct", 5: "pct", 6: "pct" };

/** @param {HTMLElement} root @param {object} results */
/**
 * @param {number | null | undefined} n
 * @param {number} [digits]
 */
function fmtKAvg(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/**
 * @param {string} value
 */
function outcomeBadge(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "yes" || v === "win") return `<span class="pct-value pct-good">Win</span>`;
  if (v === "no" || v === "loss") return `<span class="pct-value pct-bad">Loss</span>`;
  return escapeHtml(value || "—");
}

/**
 * @param {ReturnType<typeof buildPitcherProfile>} profile
 * @param {{ options: string[], selected: string | null }} select
 */
function pitcherDetailHtml(profile, select) {
  if (!select.selected) {
    return `
      <div class="card pitcher-detail pitcher-detail--empty" id="pitcher-detail">
        <div class="pitcher-detail-empty">
          <p class="pitcher-detail-empty-body">Select a pitcher to load analytics.</p>
        </div>
      </div>`;
  }

  if (!profile) {
    return `
      <div class="card pitcher-detail pitcher-detail--empty" id="pitcher-detail">
        <div class="pitcher-detail-empty">
          <p class="pitcher-detail-empty-title">${escapeHtml(select.selected)}</p>
          <p class="pitcher-detail-empty-body">No settled starts in the current date filter.</p>
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
        row.delta == null
          ? "—"
          : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}`;
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
        <td class="col-text">${escapeHtml(g.opponent || "—")}</td>
        <td class="col-center">${escapeHtml(g.homeAway || "—")}</td>
        <td class="num">${escapeHtml(g.actual != null ? fmtNum(g.actual, 0) : "—")}</td>
        <td class="num">${escapeHtml(g.ensemble != null ? fmtNum(g.ensemble, 1) : "—")}</td>
        <td class="num">${escapeHtml(g.dkLine != null ? fmtNum(g.dkLine, 1) : "—")}</td>
        <td class="col-center">${outcomeBadge(g.dkCorrect)}</td>
        <td class="col-center">${outcomeBadge(g.fdCorrect)}</td>
        <td class="col-center">${ek0Hit == null ? "—" : outcomeBadge(ek0Hit ? "Win" : "Loss")}</td>
        <td class="col-center">${ek1Hit == null ? "—" : outcomeBadge(ek1Hit ? "Win" : "Loss")}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="pitcher-detail" id="pitcher-detail">
      <div class="pitcher-detail-hero">
        <div class="pitcher-detail-identity">
          <h3 class="pitcher-detail-name">${escapeHtml(profile.pitcher)}</h3>
          <p class="pitcher-detail-meta">${escapeHtml(profile.team)} · ${escapeHtml(fmtInt(profile.starts))} starts · ${escapeHtml(range)}</p>
        </div>
        <div class="kpi-grid pitcher-detail-kpis">
          ${kpiCard("Avg Ks", fmtKAvg(profile.avgActual), "actual strikeouts", "model-pitchiq")}
          ${kpiCard("PitchIQ avg", fmtKAvg(profile.avgEnsemble), "projection average", "model-pitchiq")}
          ${kpiCard("DK line avg", fmtKAvg(profile.avgDkLine), "DraftKings O/U", "book-dk")}
          ${kpiCard("FD line avg", fmtKAvg(profile.avgFdLine), "FanDuel O/U", "book-fd")}
          ${kpiCard("MAE", profile.mae != null ? fmtNum(profile.mae, 2) : "—", "mean abs error (Ks)", "model-pitchiq")}
          ${kpiCard("Bias", fmtSigned(profile.bias), profile.bias != null && profile.bias > 0 ? "over-projects" : profile.bias != null && profile.bias < 0 ? "under-projects" : "signed error", "model-pitchiq")}
        </div>
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Analyst notes</h3>
        ${
          notes
            ? `<ul class="pitcher-notes-list">${notes}</ul>`
            : `<p class="page-sub muted" style="margin:0;">Not enough settled sample yet for matchup or strategy notes.</p>`
        }
      </div>

      <div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Strategy performance</h3>
        <div class="kpi-grid pitcher-strat-grid">${strategyCards}</div>
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
                    <th class="num">Δ vs avg</th>
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
                  <th class="col-text">Opp</th>
                  <th class="col-center">H/A</th>
                  <th class="num">Actual</th>
                  <th class="num">PitchIQ</th>
                  <th class="num">DK</th>
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
 * @param {object} results
 * @param {import("../data/games.js").GameRow[]} [games]
 */
function renderPitchers(root, results, games = []) {
  const list = games || [];
  const options = pitcherNamesFromGames(list);
  if (selectedPitcherName && !options.includes(selectedPitcherName)) {
    selectedPitcherName = null;
  }
  const profile = selectedPitcherName ? buildPitcherProfile(list, selectedPitcherName) : null;

  root.innerHTML = `
    <div class="book-theme-models">
      <div class="page-header book-page-header book-models">
        <div class="admin-page-head pitcher-page-head">
          <h2 class="page-title">Pitchers</h2>
          ${pitcherSelectHtml(options, selectedPitcherName)}
        </div>
      </div>
      ${pitcherDetailHtml(profile, { options, selected: selectedPitcherName })}
    </div>`;
}

/** @param {HTMLElement} root @param {object} results */
function renderModels(root, results) {
  const dive = results.modelDive;
  if (!dive) {
    root.innerHTML = `<div class="page-header"><h2 class="page-title">Models</h2><p class="page-sub">No PitchIQ model data available.</p></div>`;
    return;
  }
  const w1 = dive.ladder.find((r) => r.within === 1);
  const w2 = dive.ladder.find((r) => r.within === 2);
  const w3 = dive.ladder.find((r) => r.within === 3);
  const ladderOpts = { formats: WITHIN_LADDER_FMT, theme: "models", pctScale: "hit" };
  const board = results.pitchers;
  const miniOpts = { formats: BOOK_TABLE_FMT, theme: "models" };
  /** @param {object[]} rows @param {"dk"|"fd"|"ek0"|"ek1"} key */
  const strategyRows = (rows, key) =>
    (rows || []).map((r) => {
      const stats = r[key] || {};
      return [r.pitcher, stats.total, stats.winRate, fmtRecord(stats)];
    });

  root.innerHTML = `
    <div class="book-theme-models">
    <div class="page-header book-page-header book-models">
      <h2 class="page-title">PitchIQ K</h2>
      <p class="page-sub">How close the PitchIQ projection lands to actual strikeouts</p>
    </div>
    <div class="kpi-grid">
      ${kpiCard("Within 1 K", fmtPct(w1?.winRate), fmtRecord(w1), "model-pitchiq", { rate: w1?.winRate, pctScale: "hit" })}
      ${kpiCard("Within 2 K", fmtPct(w2?.winRate), fmtRecord(w2), "model-pitchiq", { rate: w2?.winRate, pctScale: "hit" })}
      ${kpiCard("Within 3 K", fmtPct(w3?.winRate), fmtRecord(w3), "model-pitchiq", { rate: w3?.winRate, pctScale: "hit" })}
      ${kpiCard("MAE", dive.mae != null ? fmtNum(dive.mae) : "—", "mean abs error (Ks)", "model-pitchiq")}
      ${kpiCard("Bias", fmtSigned(dive.bias), dive.bias != null && dive.bias > 0 ? "over-projects" : dive.bias != null && dive.bias < 0 ? "under-projects" : "signed error", "model-pitchiq")}
      ${kpiCard("Sample", fmtInt(dive.sample || 0), "settled starts w/ proj", "model-pitchiq")}
    </div>

    <section class="model-win-block book-models-block" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Accuracy ladder</h3>
        <span class="leaderboard-hint">|proj − actual| ≤ N</span>
      </div>
      <div class="card-grid">
        <div class="card card-span-2">
          <h3 class="card-title">Within 1–5 K</h3>
          ${tableHtml(
            ["Threshold", "Hits", "Hit%", "Record"],
            dive.ladder.map((r) => [r.label, r.wins, r.winRate, fmtRecord(r)]),
            { formats: { 1: "int", 2: "pct", 3: "record" }, theme: "models", pctScale: "hit" }
          )}
        </div>
      </div>
    </section>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">Monthly within 1 / 2 / 3 K</h3>
        <div class="chart-panel"><canvas id="model-hit-chart"></canvas></div>
      </div>
    </div>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">By PitchIQ projection</h3>
        ${tableHtml(
          ["Proj range", "N", "≤1 K", "≤2 K", "≤3 K", "≤4 K", "≤5 K"],
          dive.projectionRanges.map((r) => withinLadderCells(r, r.label, r.games)),
          ladderOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Home / Away</h3>
        ${tableHtml(
          ["Location", "N", "≤1 K", "≤2 K", "≤3 K", "≤4 K", "≤5 K"],
          dive.location.map((r) => withinLadderCells(r, r.label, r.games)),
          ladderOpts
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Error distribution</h3>
        ${tableHtml(
          ["|Error|", "Starts", "Share"],
          dive.errorBuckets.map((b) => [b.label, b.count, fmtPct(b.rate)]),
          { formats: { 1: "int" }, theme: "models" }
        )}
      </div>
      <div class="card card-span-2">
        <h3 class="card-title">Monthly breakdown</h3>
        ${tableHtml(
          ["Month", "N", "≤1 K", "≤2 K", "≤3 K", "≤4 K", "≤5 K"],
          dive.monthly.map((r) => [
            r.month,
            r.games,
            r.rates[1] || 0,
            r.rates[2] || 0,
            r.rates[3] || 0,
            r.rates[4] || 0,
            r.rates[5] || 0,
          ]),
          ladderOpts
        )}
      </div>
    </div>

    ${
      board
        ? `<section class="leaderboard-block tone-best" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Best pitchers by strategy</h3>
        <span class="leaderboard-hint">top ${tierListLimit} · ≥5 starts</span>
      </div>
      <div class="card-grid">
        <div class="card">
          <h3 class="card-title">Best DK O/U</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.best?.dk, "dk"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Best FD O/U</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.best?.fd, "fd"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Best EK0</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.best?.ek0, "ek0"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Best EK-1</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.best?.ek1, "ek1"), { ...miniOpts, tierList: true })}
        </div>
      </div>
    </section>

    <section class="leaderboard-block tone-worst" style="margin-top:1.5rem;">
      <div class="leaderboard-header">
        <h3 class="section-eyebrow">Worst pitchers by strategy</h3>
        <span class="leaderboard-hint">bottom ${tierListLimit} · ≥5 starts</span>
      </div>
      <div class="card-grid">
        <div class="card">
          <h3 class="card-title">Worst DK O/U</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.worst?.dk, "dk"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Worst FD O/U</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.worst?.fd, "fd"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Worst EK0</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.worst?.ek0, "ek0"), { ...miniOpts, tierList: true })}
        </div>
        <div class="card">
          <h3 class="card-title">Worst EK-1</h3>
          ${tableHtml(["Pitcher", "Starts", "Win%", "Record"], strategyRows(board.worst?.ek1, "ek1"), { ...miniOpts, tierList: true })}
        </div>
      </div>
    </section>`
        : ""
    }
    </div>`;

  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#model-hit-chart"));
  if (canvas) renderModelHitChart(canvas, dive.monthly);
}

/** @param {string | null | undefined} iso */
function fmtIsoDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** @param {number} n */
function fmtMoney(n) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * @param {object} t
 * @param {{ title: string, sub: string, periodId: string, chartId: string, visitLabel: string }} cfg
 */
function trafficPanelHtml(t, cfg) {
  return `<div class="card card-span-2">
            <div class="chart-card-head">
              <h3 class="card-title">${escapeHtml(cfg.title)}</h3>
              <label class="chart-period-label">
                <span class="sr-only">${escapeHtml(cfg.title)} chart period</span>
                <select id="${escapeHtml(cfg.periodId)}" class="chart-period-select" aria-label="${escapeHtml(cfg.title)} chart period">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
            </div>
            <p class="page-sub" style="margin:-0.25rem 0 0.85rem;">${escapeHtml(cfg.sub)}</p>
            <div class="kpi-grid">
              ${kpiCard("Today", fmtInt(t.today), cfg.visitLabel, "customers")}
              ${kpiCard("Last 7d", fmtInt(t.last7), `${fmtInt(t.uniqueSessions7)} sessions`, "customers")}
              ${kpiCard("Last 30d", fmtInt(t.last30), `${fmtInt(t.uniqueSessions30)} sessions`, "customers")}
              ${kpiCard("Signed-in 30d", fmtInt(t.signedInViews30), `${cfg.visitLabel} while logged in`, "customers")}
            </div>
            <div class="chart-panel" style="margin-top:1rem;"><canvas id="${escapeHtml(cfg.chartId)}"></canvas></div>
          </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {{ error?: string, analytics?: object, traffic?: object, trafficMobile?: object, trafficError?: string | null } | null} customers
 * @param {{ fluxPeriod?: "daily"|"weekly"|"monthly", onFluxPeriodChange?: (p: "daily"|"weekly"|"monthly") => void }} [opts]
 */
function renderCustomers(root, customers, opts = {}) {
  if (!customers) {
    root.innerHTML = `
      <div class="book-theme-customers">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Customers</h2>
          <p class="page-sub">Loading PitchIQ site customers…</p>
        </div>
      </div>`;
    return;
  }

  if (customers.error) {
    root.innerHTML = `
      <div class="book-theme-customers">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Customers</h2>
          <p class="page-sub">Owner access required · same account as Owner Tools on the site</p>
        </div>
        <div class="card" style="margin-top:1rem;">
          <p class="page-sub" style="margin:0;">${escapeHtml(customers.error)}</p>
        </div>
      </div>`;
    return;
  }

  const a = customers.analytics;
  if (!a) {
    root.innerHTML = `<div class="page-header"><h2 class="page-title">Customers</h2><p class="page-sub">No customer data.</p></div>`;
    return;
  }

  const t = customers.traffic;
  const tm = customers.trafficMobile;
  const trafficError = customers.trafficError || null;
  const trafficBlock = trafficError
    ? `<div class="card" style="margin-top:1.25rem;">
        <h3 class="card-title">Site traffic</h3>
        <p class="page-sub" style="margin:0;">${escapeHtml(trafficError)}</p>
      </div>`
    : t
      ? `<div class="card-grid" style="margin-top:1.25rem;">
          ${trafficPanelHtml(t, {
            title: "Desktop traffic",
            sub: "Index landings on viewport > 760px · owners excluded",
            periodId: "customer-pageviews-period",
            chartId: "customer-pageviews-chart",
            visitLabel: "index visits",
          })}
          ${
            tm
              ? trafficPanelHtml(tm, {
                  title: "Mobile traffic",
                  sub: "Index landings on viewport ≤ 760px · owners excluded",
                  periodId: "customer-pageviews-mobile-period",
                  chartId: "customer-pageviews-mobile-chart",
                  visitLabel: "index visits",
                })
              : ""
          }
          <div class="card">
            <h3 class="card-title">All pages · 30d</h3>
            ${tableHtml(
              ["Path", "Views", "Share"],
              (t.topPaths || []).map((r) => [r.path, r.views, fmtPct(r.share)]),
              { formats: { 1: "int" }, theme: "customers" }
            )}
          </div>
        </div>`
      : `<div class="card" style="margin-top:1.25rem;">
          <h3 class="card-title">Site traffic</h3>
          <p class="page-sub" style="margin:0;">Loading page views…</p>
        </div>`;

  root.innerHTML = `
    <div class="book-theme-customers">
    <div class="page-header book-page-header book-customers">
      <h2 class="page-title">Customers</h2>
      <p class="page-sub">PitchIQ site accounts · estimated MRR from Basic $5 / Pro $10 (not Stripe invoices)</p>
    </div>
    <div class="kpi-grid">
      ${kpiCard("Accounts", fmtInt(a.total), `${fmtInt(a.confirmed)} confirmed`, "customers")}
      ${kpiCard("Paying seats", fmtInt(a.paying), "basic/pro · Stripe active only", "customers")}
      ${kpiCard("Est. MRR", fmtMoney(a.estimatedMrr), "excludes trial, past_due, staff, comps", "customers")}
      ${kpiCard("Staff (comp)", fmtInt(a.staff || 0), "excluded from revenue", "customers")}
      ${kpiCard("Active 30d", fmtInt(a.signedIn30), `${fmtInt(a.signedIn7)} in last 7d`, "customers")}
      ${kpiCard("Period ending ≤14d", fmtInt(a.periodEndingSoon), "active / past_due / trial", "customers")}
    </div>

    ${trafficBlock}

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card">
        <h3 class="card-title">Population</h3>
        ${tableHtml(
          ["Segment", "Accounts", "Share", "Est. MRR"],
          (a.population || []).map((r) => [
            r.segment,
            r.count,
            fmtPct(r.share),
            r.mrr ? `$${r.mrr}` : "—",
          ]),
          { formats: { 1: "int" }, theme: "customers" }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Snapshot</h3>
        ${tableHtml(
          ["Metric", "Value"],
          [
            ["Currently subscribed", fmtInt(a.subscribed?.total || 0)],
            ["Basic · active", fmtInt(a.subscribed?.basic || 0)],
            ["Pro · active", fmtInt(a.subscribed?.pro || 0)],
            ["Est. MRR", fmtMoney(a.estimatedMrr || 0)],
            ["Staff (comp)", fmtInt(a.staff || 0)],
          ],
          { theme: "customers", formats: { 0: "text", 1: "text" } }
        )}
      </div>
      <div class="card card-span-2">
        <div class="chart-card-head">
          <h3 class="card-title">Active Stripe accounts</h3>
          <label class="chart-period-label">
            <span class="sr-only">Flux period</span>
            <select id="customer-flux-period" class="chart-period-select" aria-label="Flux period">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
        <p class="page-sub" style="margin:-0.25rem 0 0.65rem; text-align:center;">
          ${a.fluxError
            ? escapeHtml(a.fluxError) + " · redeploy owner-user-lookup for Stripe history"
            : "Live Stripe subscription starts/cancels · staff excluded"}
        </p>
        <div class="chart-panel"><canvas id="customer-sub-flux-chart"></canvas></div>
      </div>
    </div>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">Monthly signups</h3>
        <div class="chart-panel"><canvas id="customer-signup-chart"></canvas></div>
      </div>
    </div>

    <div class="card-grid" style="margin-top:1.25rem;">
      <div class="card card-span-2">
        <h3 class="card-title">Revenue seats (est. MRR)</h3>
        ${tableHtml(
          ["Email", "Plan", "Status", "MRR"],
          (a.revenueSeats || []).map((r) => [r.email, r.role, r.status, `$${r.mrr}`]),
          { theme: "customers", formats: { 0: "text", 1: "text", 2: "text", 3: "text" } }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">By plan / role</h3>
        ${tableHtml(
          ["Role", "Accounts", "Share"],
          a.roles.map((r) => [r.role, r.count, fmtPct(r.share)]),
          { formats: { 1: "int" }, theme: "customers" }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Subscription status</h3>
        ${tableHtml(
          ["Status", "Accounts", "Share"],
          a.statuses.map((r) => [r.status, r.count, fmtPct(r.share)]),
          { formats: { 1: "int" }, theme: "customers" }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Engagement</h3>
        ${tableHtml(
          ["Window", "Accounts", "Share"],
          [
            ["Signed in · 7d", a.signedIn7, fmtPct(a.total ? a.signedIn7 / a.total : 0)],
            ["Signed in · 30d", a.signedIn30, fmtPct(a.total ? a.signedIn30 / a.total : 0)],
            ["Signed in · 90d", a.signedIn90, fmtPct(a.total ? a.signedIn90 / a.total : 0)],
            ["Never signed in", a.neverSignedIn, fmtPct(a.total ? a.neverSignedIn / a.total : 0)],
            ["Email unconfirmed", a.unconfirmed, fmtPct(a.total ? a.unconfirmed / a.total : 0)],
            ["Banned", a.banned, fmtPct(a.total ? a.banned / a.total : 0)],
            ["Staff (comp)", a.staff || 0, fmtPct(a.total ? (a.staff || 0) / a.total : 0)],
            ["Terms accepted", a.termsAccepted, fmtPct(a.total ? a.termsAccepted / a.total : 0)],
          ],
          { formats: { 1: "int" }, theme: "customers" }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Staff accounts</h3>
        ${tableHtml(
          ["Email", "Listed role", "Status"],
          (a.staffUsers || []).map((u) => [
            u.email || "—",
            u.role || "—",
            u.subscription_status || "—",
          ]),
          { theme: "customers", formats: { 0: "text", 1: "text", 2: "text" } }
        )}
      </div>
      <div class="card">
        <h3 class="card-title">Period ending soon</h3>
        ${tableHtml(
          ["User", "Role", "Status", "Ends"],
          a.endingSoon.map((u) => [
            u.email || u.username || u.id.slice(0, 8),
            u.role || "—",
            u.subscription_status || "—",
            fmtIsoDate(u.subscription_current_period_end),
          ]),
          { theme: "customers", formats: { 0: "text", 1: "text", 2: "text" } }
        )}
      </div>
      <div class="card card-span-2">
        <h3 class="card-title">Recent signups</h3>
        ${tableHtml(
          ["Email", "Role", "Status", "Created", "Last sign-in", "Confirmed"],
          a.recent.map((u) => [
            u.email || u.username || "—",
            u.role || "—",
            u.subscription_status || "—",
            fmtIsoDate(u.created_at),
            fmtIsoDate(u.last_sign_in_at),
            u.email_confirmed_at ? "Yes" : "No",
          ]),
          { theme: "customers", formats: { 0: "text", 1: "text", 2: "text", 3: "text", 4: "text", 5: "text" } }
        )}
      </div>
    </div>
    </div>`;

  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#customer-signup-chart"));
  if (canvas) renderSignupChart(canvas, a.monthlySignups || []);

  /**
   * @param {"desktop"|"mobile"} scope
   * @param {object | null | undefined} traffic
   * @param {string} canvasId
   * @param {string} selectId
   */
  function wireTrafficChart(scope, traffic, canvasId, selectId) {
    const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector(`#${canvasId}`));
    const select = /** @type {HTMLSelectElement | null} */ (root.querySelector(`#${selectId}`));
    const period = getPageViewsPeriod(scope);
    if (select) select.value = period;
    const rows = traffic?.trends?.[period] || traffic?.daily || [];
    if (canvas && rows.length) {
      renderPageViewsChart(canvas, rows, period, scope);
    }
    select?.addEventListener("change", () => {
      const next = /** @type {"daily"|"weekly"|"monthly"|"yearly"} */ (select.value);
      setPageViewsPeriod(next, scope);
      if (canvas) {
        renderPageViewsChart(canvas, traffic?.trends?.[next] || traffic?.daily || [], next, scope);
      }
    });
  }

  wireTrafficChart("desktop", t, "customer-pageviews-chart", "customer-pageviews-period");
  wireTrafficChart("mobile", tm, "customer-pageviews-mobile-chart", "customer-pageviews-mobile-period");

  const fluxPeriod = opts.fluxPeriod || a.fluxPeriod || getCustomerFluxPeriod();
  const fluxSelect = /** @type {HTMLSelectElement | null} */ (root.querySelector("#customer-flux-period"));
  if (fluxSelect) {
    fluxSelect.value = fluxPeriod;
    fluxSelect.addEventListener("change", () => {
      const next = /** @type {"daily"|"weekly"|"monthly"} */ (fluxSelect.value);
      setCustomerFluxPeriod(next);
      opts.onFluxPeriodChange?.(next);
    });
  }
  const fluxCanvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#customer-sub-flux-chart"));
  if (fluxCanvas) renderSubFluxChart(fluxCanvas, a.activeSubSeries || [], fluxPeriod);
}

/**
 * @typedef {{
 *   selectedUserId?: string | null,
 *   busy?: boolean,
 *   status?: string,
 *   emailStatus?: string,
 *   onSelectUser?: (userId: string) => void,
 *   onRefresh?: () => void,
 *   onSetRole?: (userId: string, role: string) => void,
 *   onBan?: (userId: string) => void,
 *   onUnban?: (userId: string) => void,
 *   onResend?: (userId: string) => void,
 *   onOpenStripe?: (userId: string) => void,
 *   onDelete?: (userId: string) => void,
 *   onSendEmail?: (payload: { subject: string, body: string, userIds: string[], all: boolean, audience: string }) => void,
 *   onRequestClient?: () => Promise<import("@supabase/supabase-js").SupabaseClient>,
 * }} AdminOpts
 */

/** @type {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} */
const adminTableFilter = {
  query: "",
  role: "all",
  status: "all",
  banned: "all",
  confirmed: "all",
  stripe: "all",
};

/** @type {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} */
const emailTableFilter = {
  query: "",
  role: "all",
  status: "all",
  banned: "all",
  confirmed: "all",
  stripe: "all",
};

/** @type {{ audience: "selected"|"filtered"|"all", subject: string, body: string }} */
const emailDraft = {
  audience: "selected",
  subject: "",
  body: "",
};

/** @type {Set<string>} */
const emailSelectedIds = new Set();

/**
 * @param {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} filter
 */
function filtersActive(filter) {
  return (
    Boolean(filter.query.trim()) ||
    filter.role !== "all" ||
    filter.status !== "all" ||
    filter.banned !== "all" ||
    filter.confirmed !== "all" ||
    filter.stripe !== "all"
  );
}

/**
 * @param {import("../data/customers.js").OwnerUser[]} users
 * @param {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} filter
 */
function filterUsersBy(users, filter) {
  const q = filter.query.trim().toLowerCase();
  return users.filter((user) => {
    if (q) {
      const hay = [
        user.email,
        user.username,
        user.id,
        user.role,
        user.subscription_status,
        user.stripe_customer_id,
        user.stripe_subscription_id,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      if (!hay.includes(q)) return false;
    }

    const role = String(user.role || "").trim().toLowerCase() || "none";
    if (filter.role !== "all" && role !== filter.role) return false;

    const status = String(user.subscription_status || "").trim().toLowerCase() || "none";
    if (filter.status !== "all" && status !== filter.status) return false;

    if (filter.banned === "yes" && !user.is_banned) return false;
    if (filter.banned === "no" && user.is_banned) return false;

    if (filter.confirmed === "yes" && !user.email_confirmed_at) return false;
    if (filter.confirmed === "no" && user.email_confirmed_at) return false;

    if (filter.stripe === "yes" && !user.stripe_customer_id) return false;
    if (filter.stripe === "no" && user.stripe_customer_id) return false;

    return true;
  });
}

function adminFiltersActive() {
  return filtersActive(adminTableFilter);
}

/**
 * @param {import("../data/customers.js").OwnerUser[]} users
 */
function filterAdminUsers(users) {
  return filterUsersBy(users, adminTableFilter);
}

/**
 * @param {import("../data/customers.js").OwnerUser[]} users
 */
function adminFilterOptions(users) {
  /** @type {Set<string>} */
  const roles = new Set();
  /** @type {Set<string>} */
  const statuses = new Set();
  for (const user of users) {
    roles.add(String(user.role || "").trim().toLowerCase() || "none");
    statuses.add(String(user.subscription_status || "").trim().toLowerCase() || "none");
  }
  const roleOrder = ["basic", "pro", "life", "admin", "owner", "none"];
  const statusOrder = ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "none"];
  const sortedRoles = roleOrder.filter((r) => roles.has(r)).concat([...roles].filter((r) => !roleOrder.includes(r)).sort());
  const sortedStatuses = statusOrder
    .filter((s) => statuses.has(s))
    .concat([...statuses].filter((s) => !statusOrder.includes(s)).sort());
  return { roles: sortedRoles, statuses: sortedStatuses };
}

/**
 * @param {string[]} values
 * @param {string} selected
 * @param {string} allLabel
 */
function adminFilterSelectOptions(values, selected, allLabel = "All") {
  return [`<option value="all"${selected === "all" ? " selected" : ""}>${escapeHtml(allLabel)}</option>`]
    .concat(
      values.map(
        (value) =>
          `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`
      )
    )
    .join("");
}

/**
 * @param {string} prefix
 * @param {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} filter
 * @param {import("../data/customers.js").OwnerUser[]} allUsers
 * @param {number} visibleCount
 */
function customerFilterBar(prefix, filter, allUsers, visibleCount) {
  const { roles, statuses } = adminFilterOptions(allUsers);
  const active = filtersActive(filter);
  return `
    <div class="admin-filter-bar">
      <label class="admin-filter-search">
        <span class="sr-only">Search customers</span>
        <input
          id="${prefix}-filter-query"
          type="search"
          class="admin-filter-input"
          placeholder="Search email, username, id, role, Stripe…"
          value="${escapeHtml(filter.query)}"
          autocomplete="off"
        />
      </label>
      <label class="admin-filter-field">
        <span>Role</span>
        <select id="${prefix}-filter-role" class="admin-select">
          ${adminFilterSelectOptions(roles, filter.role, "All roles")}
        </select>
      </label>
      <label class="admin-filter-field">
        <span>Status</span>
        <select id="${prefix}-filter-status" class="admin-select">
          ${adminFilterSelectOptions(statuses, filter.status, "All statuses")}
        </select>
      </label>
      <label class="admin-filter-field">
        <span>Banned</span>
        <select id="${prefix}-filter-banned" class="admin-select">
          <option value="all"${filter.banned === "all" ? " selected" : ""}>All</option>
          <option value="yes"${filter.banned === "yes" ? " selected" : ""}>Banned</option>
          <option value="no"${filter.banned === "no" ? " selected" : ""}>Not banned</option>
        </select>
      </label>
      <label class="admin-filter-field">
        <span>Confirmed</span>
        <select id="${prefix}-filter-confirmed" class="admin-select">
          <option value="all"${filter.confirmed === "all" ? " selected" : ""}>All</option>
          <option value="yes"${filter.confirmed === "yes" ? " selected" : ""}>Confirmed</option>
          <option value="no"${filter.confirmed === "no" ? " selected" : ""}>Unconfirmed</option>
        </select>
      </label>
      <label class="admin-filter-field">
        <span>Stripe</span>
        <select id="${prefix}-filter-stripe" class="admin-select">
          <option value="all"${filter.stripe === "all" ? " selected" : ""}>All</option>
          <option value="yes"${filter.stripe === "yes" ? " selected" : ""}>Has Stripe</option>
          <option value="no"${filter.stripe === "no" ? " selected" : ""}>No Stripe</option>
        </select>
      </label>
      <button type="button" class="btn btn-ghost btn-sm" id="${prefix}-filter-clear" ${active ? "" : "disabled"}>Clear</button>
      <p class="admin-filter-count muted">${fmtInt(visibleCount)} of ${fmtInt(allUsers.length)}</p>
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {string} prefix
 * @param {{ query: string, role: string, status: string, banned: string, confirmed: string, stripe: string }} filter
 * @param {() => void} rerender
 */
function wireCustomerFilters(root, prefix, filter, rerender) {
  const queryInput = /** @type {HTMLInputElement | null} */ (root.querySelector(`#${prefix}-filter-query`));
  queryInput?.addEventListener("input", () => {
    filter.query = queryInput.value;
    rerender();
  });

  /** @param {string} key @param {keyof typeof filter} field */
  function wireSelect(key, field) {
    const select = /** @type {HTMLSelectElement | null} */ (root.querySelector(`#${prefix}-filter-${key}`));
    select?.addEventListener("change", () => {
      filter[field] = select.value;
      rerender();
    });
  }
  wireSelect("role", "role");
  wireSelect("status", "status");
  wireSelect("banned", "banned");
  wireSelect("confirmed", "confirmed");
  wireSelect("stripe", "stripe");

  root.querySelector(`#${prefix}-filter-clear`)?.addEventListener("click", () => {
    filter.query = "";
    filter.role = "all";
    filter.status = "all";
    filter.banned = "all";
    filter.confirmed = "all";
    filter.stripe = "all";
    rerender();
  });
}

/**
 * @param {HTMLElement} root
 */
function restoreFocus(root) {
  const focusId = document.activeElement instanceof HTMLElement ? document.activeElement.id : null;
  const focusEl =
    document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      ? document.activeElement
      : null;
  const focusStart = focusEl?.selectionStart ?? null;
  const focusEnd = focusEl?.selectionEnd ?? null;
  return () => {
    if (!focusId) return;
    const next = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (
      root.querySelector(`#${CSS.escape(focusId)}`)
    );
    if (!next) return;
    next.focus();
    if (
      (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) &&
      focusStart != null &&
      focusEnd != null
    ) {
      try {
        next.setSelectionRange(focusStart, focusEnd);
      } catch {
        /* ignore */
      }
    }
  };
}

/**
 * @param {import("../data/customers.js").OwnerUser[]} users
 * @param {string | null | undefined} selectedUserId
 * @param {boolean} [filtersOn]
 */
function adminMasterTable(users, selectedUserId, filtersOn = false) {
  const sorted = [...users].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bt - at;
  });

  const head = ["", "Email", "Role", "Status", "Banned", "Confirmed", "Created", "Last sign-in", "Stripe"]
    .map((h) => `<th class="${h === "" ? "col-center" : "col-text"}">${escapeHtml(h)}</th>`)
    .join("");

  const emptyLabel = filtersOn ? "No customers match these filters." : "No customers";

  const body = sorted
    .map((u) => {
      const selected = u.id === selectedUserId;
      const label = u.email || u.username || u.id.slice(0, 8);
      return `<tr class="admin-user-row${selected ? " is-selected" : ""}${u.is_banned ? " is-banned" : ""}" data-admin-user-id="${escapeHtml(u.id)}" tabindex="0" role="button" aria-pressed="${selected ? "true" : "false"}">
        <td class="col-center"><span class="admin-select-dot" aria-hidden="true"></span></td>
        <td class="col-text">${escapeHtml(label)}</td>
        <td class="col-text">${escapeHtml(u.role || "—")}</td>
        <td class="col-text">${escapeHtml(u.subscription_status || "—")}</td>
        <td class="col-text">${u.is_banned ? `<span class="admin-badge is-banned">Banned</span>` : `<span class="admin-badge is-ok">OK</span>`}</td>
        <td class="col-text">${u.email_confirmed_at ? "Yes" : "No"}</td>
        <td class="col-text">${escapeHtml(fmtIsoDate(u.created_at))}</td>
        <td class="col-text">${escapeHtml(fmtIsoDate(u.last_sign_in_at))}</td>
        <td class="col-text">${u.stripe_customer_id ? "Yes" : "—"}</td>
      </tr>`;
    })
    .join("");

  return `
    <div class="table-shell table-theme-customers admin-master-table">
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body || `<tr><td class="col-center mini-empty" colspan="9">${escapeHtml(emptyLabel)}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

/**
 * @param {import("../data/customers.js").OwnerUser} user
 * @param {AdminOpts} opts
 */
function adminActionPanel(user, opts) {
  const roleValue = String(user.role || "").toLowerCase();
  const label = user.email || user.username || user.id;
  const busy = Boolean(opts.busy);

  return `
    <div class="admin-actions" data-admin-actions-for="${escapeHtml(user.id)}">
      <div class="admin-actions-head">
        <div>
          <h3 class="card-title">Actions</h3>
          <p class="page-sub" style="margin:0.15rem 0 0;">${escapeHtml(label)}</p>
        </div>
        <p class="admin-action-status muted">${escapeHtml(opts.status || "")}</p>
      </div>

      <div class="admin-action-grid">
        <div class="admin-action-card">
          <p class="admin-action-title">Membership</p>
          <div class="admin-action-controls">
            <select id="admin-role-select" class="admin-select" ${busy ? "disabled" : ""}>
              ${roleValue === "owner" ? `<option value="owner" selected disabled>Owner (DB only)</option>` : ""}
              <option value="" ${!roleValue ? "selected" : ""}>None</option>
              <option value="basic" ${roleValue === "basic" ? "selected" : ""}>Basic</option>
              <option value="pro" ${roleValue === "pro" ? "selected" : ""}>Pro</option>
              <option value="life" ${roleValue === "life" ? "selected" : ""}>Life</option>
              <option value="admin" ${roleValue === "admin" ? "selected" : ""}>Admin</option>
            </select>
            <button type="button" class="btn btn-primary btn-sm" id="admin-btn-set-role" ${busy ? "disabled" : ""}>Save</button>
          </div>
        </div>

        <div class="admin-action-card">
          <p class="admin-action-title">${user.is_banned ? "Unban" : "Ban"}</p>
          <div class="admin-action-controls">
            ${user.is_banned
              ? `<button type="button" class="btn btn-secondary btn-sm" id="admin-btn-unban" ${busy ? "disabled" : ""}>Unban</button>`
              : `<button type="button" class="btn btn-danger btn-sm" id="admin-btn-ban" ${busy ? "disabled" : ""}>Ban</button>`}
          </div>
        </div>

        <div class="admin-action-card">
          <p class="admin-action-title">Confirm email</p>
          <div class="admin-action-controls">
            <button type="button" class="btn btn-ghost btn-sm" id="admin-btn-resend" ${busy || user.email_confirmed_at ? "disabled" : ""}>Resend</button>
          </div>
        </div>

        <div class="admin-action-card">
          <p class="admin-action-title">Stripe</p>
          <div class="admin-action-controls">
            <button type="button" class="btn btn-ghost btn-sm" id="admin-btn-stripe" ${busy || !user.stripe_customer_id ? "disabled" : ""}>Open</button>
          </div>
        </div>

        <div class="admin-action-card admin-action-card--danger">
          <p class="admin-action-title">Delete</p>
          <div class="admin-action-controls">
            <button type="button" class="btn btn-danger btn-sm" id="admin-btn-delete" ${busy ? "disabled" : ""}>Delete</button>
          </div>
        </div>
      </div>

      <dl class="admin-user-meta">
        <div><dt>User ID</dt><dd><code>${escapeHtml(user.id)}</code></dd></div>
        <div><dt>Stripe customer</dt><dd><code>${escapeHtml(user.stripe_customer_id || "—")}</code></dd></div>
        <div><dt>Subscription</dt><dd><code>${escapeHtml(user.stripe_subscription_id || "—")}</code></dd></div>
        <div><dt>Period end</dt><dd>${escapeHtml(fmtIsoDate(user.subscription_current_period_end))}</dd></div>
      </dl>
    </div>`;
}

/**
 * @param {HTMLElement} root
 * @param {{ error?: string, analytics?: object, users?: import("../data/customers.js").OwnerUser[] } | null} customers
 * @param {AdminOpts} [opts]
 */
function renderAdmin(root, customers, opts = {}) {
  if (!customers) {
    root.innerHTML = `
      <div class="book-theme-customers admin-page">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Admin</h2>
          <p class="page-sub">Loading…</p>
        </div>
      </div>`;
    return;
  }

  if (customers.error) {
    root.innerHTML = `
      <div class="book-theme-customers admin-page">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Admin</h2>
          <p class="page-sub">Owner access required</p>
        </div>
        <div class="card">
          <p class="page-sub" style="margin:0;">${escapeHtml(customers.error)}</p>
        </div>
      </div>`;
    return;
  }

  const users = Array.isArray(customers.users) ? customers.users : [];
  const filtered = filterAdminUsers(users);
  const filtersOn = adminFiltersActive();
  const selected = users.find((u) => u.id === opts.selectedUserId) || null;
  const applyFocus = restoreFocus(root);

  root.innerHTML = `
    <div class="book-theme-customers admin-page">
      <div class="page-header book-page-header book-customers">
        <div class="admin-page-head">
          <div>
            <h2 class="page-title">Admin</h2>
            <p class="page-sub">Manage accounts · ban, role, Stripe</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="admin-btn-refresh" ${opts.busy ? "disabled" : ""}>Refresh</button>
        </div>
      </div>

      <div class="admin-layout">
        <div class="card admin-master-card">
          <div class="admin-master-head">
            <h3 class="card-title">Customers</h3>
            <p class="page-sub" style="margin:0;">Select a row</p>
          </div>
          ${customerFilterBar("admin", adminTableFilter, users, filtered.length)}
          ${adminMasterTable(filtered, opts.selectedUserId, filtersOn)}
        </div>

        <div class="card admin-actions-card">
          ${selected
            ? adminActionPanel(selected, opts)
            : `<div class="admin-actions-empty">
                <h3 class="card-title">Actions</h3>
                <p class="page-sub" style="margin:0.35rem 0 0;">Select a customer to manage membership, ban status, or billing.</p>
              </div>`}
        </div>
      </div>
    </div>`;

  const rerender = () => renderAdmin(root, customers, opts);
  wireCustomerFilters(root, "admin", adminTableFilter, rerender);
  applyFocus();

  root.querySelectorAll(".admin-user-row").forEach((row) => {
    const id = row.getAttribute("data-admin-user-id");
    if (!id) return;
    const select = () => opts.onSelectUser?.(id);
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });

  root.querySelector("#admin-btn-refresh")?.addEventListener("click", () => opts.onRefresh?.());

  if (!selected) return;

  root.querySelector("#admin-btn-set-role")?.addEventListener("click", () => {
    const select = /** @type {HTMLSelectElement | null} */ (root.querySelector("#admin-role-select"));
    opts.onSetRole?.(selected.id, select?.value ?? "");
  });
  root.querySelector("#admin-btn-ban")?.addEventListener("click", () => opts.onBan?.(selected.id));
  root.querySelector("#admin-btn-unban")?.addEventListener("click", () => opts.onUnban?.(selected.id));
  root.querySelector("#admin-btn-resend")?.addEventListener("click", () => opts.onResend?.(selected.id));
  root.querySelector("#admin-btn-stripe")?.addEventListener("click", () => opts.onOpenStripe?.(selected.id));
  root.querySelector("#admin-btn-delete")?.addEventListener("click", () => opts.onDelete?.(selected.id));
}

/**
 * @param {import("../data/customers.js").OwnerUser[]} pool
 * @param {Set<string>} selectedIds
 */
function emailRecipientTable(pool, selectedIds) {
  const head = ["", "Email", "Role", "Status", "Banned"]
    .map((h, i) => `<th class="${i === 0 ? "col-center" : "col-text"}">${escapeHtml(h)}</th>`)
    .join("");
  const body = pool
    .slice(0, 500)
    .map((u) => {
      const label = u.email || u.username || u.id.slice(0, 8);
      const checked = selectedIds.has(u.id);
      return `<tr class="email-recipient-row${checked ? " is-selected" : ""}" data-email-user-id="${escapeHtml(u.id)}" tabindex="0" role="checkbox" aria-checked="${checked ? "true" : "false"}">
        <td class="col-center">
          <input type="checkbox" class="email-recipient-check" data-email-user-id="${escapeHtml(u.id)}" ${checked ? "checked" : ""} aria-label="Select ${escapeHtml(label)}" />
        </td>
        <td class="col-text">${escapeHtml(label)}</td>
        <td class="col-text">${escapeHtml(u.role || "—")}</td>
        <td class="col-text">${escapeHtml(u.subscription_status || "—")}</td>
        <td class="col-text">${u.is_banned ? "Banned" : "OK"}</td>
      </tr>`;
    })
    .join("");

  const overflow =
    pool.length > 500
      ? `<p class="page-sub" style="margin:0.5rem 0 0;">Showing first 500 of ${fmtInt(pool.length)}.</p>`
      : "";

  return `
    <div class="table-shell table-theme-customers admin-email-table">
      <div class="table-scroll">
        <table class="data-table email-recipient-data">
          <thead><tr>${head}</tr></thead>
          <tbody>${body || `<tr><td class="col-center mini-empty" colspan="5">No customers match these filters</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    ${overflow}`;
}

/**
 * @param {HTMLElement} root
 * @param {{ error?: string, analytics?: object, users?: import("../data/customers.js").OwnerUser[] } | null} customers
 * @param {AdminOpts} [opts]
 */
function renderEmail(root, customers, opts = {}) {
  if (!customers) {
    root.innerHTML = `
      <div class="book-theme-customers email-page">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Email</h2>
          <p class="page-sub">Loading…</p>
        </div>
      </div>`;
    return;
  }

  if (customers.error) {
    root.innerHTML = `
      <div class="book-theme-customers email-page">
        <div class="page-header book-page-header book-customers">
          <h2 class="page-title">Email</h2>
          <p class="page-sub">Owner access required</p>
        </div>
        <div class="card">
          <p class="page-sub" style="margin:0;">${escapeHtml(customers.error)}</p>
        </div>
      </div>`;
    return;
  }

  const users = Array.isArray(customers.users) ? customers.users : [];
  const withEmail = users.filter((u) => u.email);
  const pool = filterUsersBy(withEmail, emailTableFilter);
  const poolIds = new Set(pool.map((u) => u.id));

  // Drop selections that no longer exist
  for (const id of [...emailSelectedIds]) {
    if (!withEmail.some((u) => u.id === id)) emailSelectedIds.delete(id);
  }

  // Keep checks continuous with the chosen audience
  if (emailDraft.audience === "all") {
    emailSelectedIds.clear();
    for (const user of withEmail) emailSelectedIds.add(user.id);
  } else if (emailDraft.audience === "filtered") {
    emailSelectedIds.clear();
    for (const user of pool) emailSelectedIds.add(user.id);
  }

  /** @type {import("../data/customers.js").OwnerUser[]} */
  let recipients = [];
  if (emailDraft.audience === "all") {
    recipients = withEmail;
  } else if (emailDraft.audience === "filtered") {
    recipients = pool;
  } else {
    recipients = withEmail.filter((u) => emailSelectedIds.has(u.id));
  }

  const busy = Boolean(opts.busy);
  const selectedInPool = pool.filter((u) => emailSelectedIds.has(u.id)).length;
  const applyFocus = restoreFocus(root);

  root.innerHTML = `
    <div class="book-theme-customers email-page">
      <div class="page-header book-page-header book-customers">
        <div class="admin-page-head">
          <div>
            <h2 class="page-title">Email</h2>
            <p class="page-sub">Broadcast via Resend · pitchIQ template</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="admin-btn-refresh" ${busy ? "disabled" : ""}>Refresh</button>
        </div>
      </div>

      <div class="email-layout">
        <div class="card">
          <div class="admin-actions-head">
            <div>
              <h3 class="card-title">Compose</h3>
              <p class="page-sub" style="margin:0.15rem 0 0;">Plain text · line breaks preserved</p>
            </div>
            <p class="admin-action-status muted">${escapeHtml(opts.emailStatus || "")}</p>
          </div>

          <div class="admin-email-audience" role="radiogroup" aria-label="Email audience">
            <label class="admin-radio">
              <input type="radio" name="email-audience" value="selected" ${emailDraft.audience === "selected" ? "checked" : ""} ${busy ? "disabled" : ""} />
              <span>Checked rows (${fmtInt(emailSelectedIds.size)})</span>
            </label>
            <label class="admin-radio">
              <input type="radio" name="email-audience" value="filtered" ${emailDraft.audience === "filtered" ? "checked" : ""} ${busy ? "disabled" : ""} />
              <span>All filtered (${fmtInt(pool.length)})</span>
            </label>
            <label class="admin-radio">
              <input type="radio" name="email-audience" value="all" ${emailDraft.audience === "all" ? "checked" : ""} ${busy ? "disabled" : ""} />
              <span>All customers (${fmtInt(withEmail.length)})</span>
            </label>
          </div>

          <div class="admin-email-compose">
            <label class="field">
              <span>Subject</span>
              <input id="email-subject" type="text" class="admin-filter-input" maxlength="200" value="${escapeHtml(emailDraft.subject)}" placeholder="Subject line" ${busy ? "disabled" : ""} />
            </label>
            <label class="field">
              <span>Message</span>
              <textarea id="email-body" class="admin-email-body" rows="10" placeholder="Write your message…" ${busy ? "disabled" : ""}>${escapeHtml(emailDraft.body)}</textarea>
            </label>
            <div class="admin-email-send-row">
              <p class="page-sub" style="margin:0;">Sending to ${fmtInt(recipients.length)} recipient${recipients.length === 1 ? "" : "s"}</p>
              <button type="button" class="btn btn-primary" id="email-btn-send" ${busy || !recipients.length ? "disabled" : ""}>Send</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="admin-master-head">
            <h3 class="card-title">Recipients</h3>
            <p class="page-sub" style="margin:0;">${fmtInt(selectedInPool)} checked in view</p>
          </div>
          ${customerFilterBar("email", emailTableFilter, withEmail, pool.length)}
          <div class="email-select-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="email-select-visible" ${busy || !pool.length ? "disabled" : ""}>Check visible</button>
            <button type="button" class="btn btn-ghost btn-sm" id="email-clear-selection" ${busy || !emailSelectedIds.size ? "disabled" : ""}>Clear checks</button>
          </div>
          ${emailRecipientTable(pool, emailSelectedIds)}
        </div>
      </div>

      <div class="card" style="margin-top:1.25rem;" id="email-jobs-root"></div>
    </div>`;

  const rerender = () => renderEmail(root, customers, opts);

  // Filtering while "All customers" is on → switch to filtered so table + send stay aligned
  const onFilterChange = () => {
    if (emailDraft.audience === "all") emailDraft.audience = "filtered";
    else if (emailDraft.audience === "selected") {
      /* keep manual checks */
    }
    rerender();
  };
  wireCustomerFilters(root, "email", emailTableFilter, onFilterChange);
  applyFocus();

  function clearEmailFilters() {
    emailTableFilter.query = "";
    emailTableFilter.role = "all";
    emailTableFilter.status = "all";
    emailTableFilter.banned = "all";
    emailTableFilter.confirmed = "all";
    emailTableFilter.stripe = "all";
  }

  function syncEmailSelectionUi() {
    const selectedCount = emailSelectedIds.size;
    const checkedInView = pool.filter((u) => emailSelectedIds.has(u.id)).length;

    /** @type {import("../data/customers.js").OwnerUser[]} */
    let nextRecipients = [];
    if (emailDraft.audience === "all") nextRecipients = withEmail;
    else if (emailDraft.audience === "filtered") nextRecipients = pool;
    else nextRecipients = withEmail.filter((u) => emailSelectedIds.has(u.id));

    const selectedLabel = root.querySelector('input[name="email-audience"][value="selected"]')?.closest("label")?.querySelector("span");
    if (selectedLabel) selectedLabel.textContent = `Checked rows (${fmtInt(selectedCount)})`;

    const filteredLabel = root.querySelector('input[name="email-audience"][value="filtered"]')?.closest("label")?.querySelector("span");
    if (filteredLabel) filteredLabel.textContent = `All filtered (${fmtInt(pool.length)})`;

    const headCount = root.querySelector(".admin-master-head .page-sub");
    if (headCount) headCount.textContent = `${fmtInt(checkedInView)} checked in view`;

    const sendRow = root.querySelector(".admin-email-send-row .page-sub");
    if (sendRow) {
      sendRow.textContent = `Sending to ${fmtInt(nextRecipients.length)} recipient${nextRecipients.length === 1 ? "" : "s"}`;
    }

    const sendBtn = /** @type {HTMLButtonElement | null} */ (root.querySelector("#email-btn-send"));
    if (sendBtn) sendBtn.disabled = busy || !nextRecipients.length;

    const clearBtn = /** @type {HTMLButtonElement | null} */ (root.querySelector("#email-clear-selection"));
    if (clearBtn) clearBtn.disabled = busy || !selectedCount;

    root.querySelectorAll('input[name="email-audience"]').forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = input.value === emailDraft.audience;
      }
    });

    recipients = nextRecipients;
  }

  /** @param {Iterable<string>} ids @param {boolean} checked */
  function paintRecipientChecks(ids, checked) {
    for (const userId of ids) {
      const row = root.querySelector(`.email-recipient-row[data-email-user-id="${CSS.escape(userId)}"]`);
      const check = /** @type {HTMLInputElement | null} */ (
        root.querySelector(`.email-recipient-check[data-email-user-id="${CSS.escape(userId)}"]`)
      );
      row?.classList.toggle("is-selected", checked);
      row?.setAttribute("aria-checked", checked ? "true" : "false");
      if (check) check.checked = checked;
    }
  }

  /**
   * @param {string} userId
   * @param {boolean} [force]
   */
  function setRecipientChecked(userId, force) {
    const next =
      typeof force === "boolean" ? force : !emailSelectedIds.has(userId);
    if (next) emailSelectedIds.add(userId);
    else emailSelectedIds.delete(userId);

    paintRecipientChecks([userId], next);

    if (emailDraft.audience !== "selected") emailDraft.audience = "selected";
    syncEmailSelectionUi();
  }

  root.querySelectorAll(".email-recipient-row").forEach((row) => {
    const id = row.getAttribute("data-email-user-id");
    if (!id) return;
    row.addEventListener("click", (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.closest("input, a, button")) return;
      event.preventDefault();
      setRecipientChecked(id);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setRecipientChecked(id);
      }
    });
  });

  root.querySelectorAll(".email-recipient-check").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", () => {
      const id = input.getAttribute("data-email-user-id");
      if (!id || !(input instanceof HTMLInputElement)) return;
      setRecipientChecked(id, input.checked);
    });
  });

  root.querySelector("#email-select-visible")?.addEventListener("click", () => {
    for (const id of poolIds) emailSelectedIds.add(id);
    paintRecipientChecks(poolIds, true);
    emailDraft.audience = "selected";
    syncEmailSelectionUi();
  });

  root.querySelector("#email-clear-selection")?.addEventListener("click", () => {
    const previous = [...emailSelectedIds];
    emailSelectedIds.clear();
    paintRecipientChecks(previous, false);
    emailDraft.audience = "selected";
    syncEmailSelectionUi();
  });

  root.querySelectorAll('input[name="email-audience"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!(input instanceof HTMLInputElement) || !input.checked) return;
      const next = /** @type {"selected"|"filtered"|"all"} */ (input.value);
      emailDraft.audience = next;

      if (next === "all") {
        clearEmailFilters();
        emailSelectedIds.clear();
        for (const user of withEmail) emailSelectedIds.add(user.id);
        rerender();
        return;
      }

      if (next === "filtered") {
        emailSelectedIds.clear();
        for (const id of poolIds) emailSelectedIds.add(id);
        // Uncheck anything not in pool, check pool
        root.querySelectorAll(".email-recipient-row").forEach((row) => {
          const id = row.getAttribute("data-email-user-id");
          if (!id) return;
          const on = poolIds.has(id);
          row.classList.toggle("is-selected", on);
          row.setAttribute("aria-checked", on ? "true" : "false");
          const check = /** @type {HTMLInputElement | null} */ (
            row.querySelector(".email-recipient-check")
          );
          if (check) check.checked = on;
        });
        syncEmailSelectionUi();
        return;
      }

      // selected — keep current checks, just update labels/send count
      syncEmailSelectionUi();
    });
  });

  const subjectInput = /** @type {HTMLInputElement | null} */ (root.querySelector("#email-subject"));
  subjectInput?.addEventListener("input", () => {
    emailDraft.subject = subjectInput.value;
  });
  const bodyInput = /** @type {HTMLTextAreaElement | null} */ (root.querySelector("#email-body"));
  bodyInput?.addEventListener("input", () => {
    emailDraft.body = bodyInput.value;
  });

  root.querySelector("#admin-btn-refresh")?.addEventListener("click", () => opts.onRefresh?.());
  root.querySelector("#email-btn-send")?.addEventListener("click", () => {
    emailDraft.subject = subjectInput?.value || "";
    emailDraft.body = bodyInput?.value || "";
    /** @type {import("../data/customers.js").OwnerUser[]} */
    let sendList = [];
    if (emailDraft.audience === "all") sendList = withEmail;
    else if (emailDraft.audience === "filtered") sendList = pool;
    else sendList = withEmail.filter((u) => emailSelectedIds.has(u.id));

    opts.onSendEmail?.({
      subject: emailDraft.subject,
      body: emailDraft.body,
      userIds: sendList.map((u) => u.id),
      all: emailDraft.audience === "all",
      audience: emailDraft.audience,
    });
  });

  const jobsRoot = /** @type {HTMLElement | null} */ (root.querySelector("#email-jobs-root"));
  if (jobsRoot && opts.onRequestClient) {
    mountEmailJobsPanel(jobsRoot, {
      busy,
      onRequestClient: opts.onRequestClient,
    });
  }
}

/**
 * Wire “Send to Media Creator” buttons after a view render.
 * @param {HTMLElement} root
 * @param {(el: HTMLElement, label: string) => void | Promise<void>} [onSendToMedia]
 */
export function wireMediaSendButtons(root, onSendToMedia) {
  if (!onSendToMedia) return;
  root.querySelectorAll(".media-send-btn").forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    if (btn.dataset.mediaWired === "1") return;
    btn.dataset.mediaWired = "1";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const captureRoot = resolveCaptureRoot(btn);
      if (!(captureRoot instanceof HTMLElement)) return;
      const label = resolveCaptureLabel(captureRoot);
      Promise.resolve(onSendToMedia(captureRoot, label)).catch((error) => {
        console.error(error);
        window.alert(error?.message || "Failed to capture table.");
      });
    });
  });
}

/**
 * Wire Pitchers typeahead combobox.
 * @param {HTMLElement} root
 * @param {() => void} [onChange]
 */
function wirePitcherSelect(root, onChange) {
  const box = /** @type {HTMLElement | null} */ (root.querySelector(".pitcher-combobox"));
  const input = /** @type {HTMLInputElement | null} */ (root.querySelector("#pitcher-select"));
  const list = /** @type {HTMLElement | null} */ (root.querySelector("#pitcher-select-list"));
  if (!box || !input || !list || box.dataset.pitcherWired === "1") return;
  box.dataset.pitcherWired = "1";

  const allOptions = [...list.querySelectorAll("[data-value]")].map((el) => ({
    el: /** @type {HTMLElement} */ (el),
    value: el.getAttribute("data-value") || "",
  }));

  /** @type {number} */
  let activeIndex = -1;

  function commit(value) {
    const next = String(value || "").trim() || null;
    if (next === selectedPitcherName) {
      input.value = next || "";
      close();
      return;
    }
    selectedPitcherName = next;
    onChange?.();
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
      input.value = selectedPitcherName || "";
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
        if (selectedPitcherName) commit(null);
        else {
          input.value = "";
          close();
        }
        return;
      }
      const exact = allOptions.find(({ value }) => value.toLowerCase() === typed.toLowerCase());
      if (exact) {
        if (exact.value !== selectedPitcherName) commit(exact.value);
        else {
          input.value = exact.value;
          close();
        }
        return;
      }
      input.value = selectedPitcherName || "";
      close();
    }, 120);
  });
}

/**
 * Wire tier-list row-count dropdowns (Show 5 / Show 10).
 * @param {HTMLElement} root
 * @param {() => void} [onChange]
 */
function wireTierListControls(root, onChange) {
  root.querySelectorAll(".tier-limit-menu").forEach((menu) => {
    if (!(menu instanceof HTMLElement)) return;
    if (menu.dataset.tierWired === "1") return;
    menu.dataset.tierWired = "1";

    const toggle = /** @type {HTMLButtonElement | null} */ (menu.querySelector(".tier-limit-btn"));
    const panel = /** @type {HTMLElement | null} */ (menu.querySelector(".tier-limit-panel"));
    if (!toggle || !panel) return;

    /** @type {((event: MouseEvent) => void) | null} */
    let outsideHandler = null;

    function closeMenu() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (outsideHandler) {
        document.removeEventListener("click", outsideHandler);
        outsideHandler = null;
      }
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = panel.hidden;
      root.querySelectorAll(".tier-limit-panel").forEach((other) => {
        if (other !== panel) /** @type {HTMLElement} */ (other).hidden = true;
      });
      root.querySelectorAll(".tier-limit-btn").forEach((btn) => {
        if (btn !== toggle) btn.setAttribute("aria-expanded", "false");
      });
      if (!willOpen) {
        closeMenu();
        return;
      }
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      outsideHandler = () => closeMenu();
      setTimeout(() => {
        if (outsideHandler) document.addEventListener("click", outsideHandler);
      }, 0);
    });

    menu.querySelectorAll("[data-tier-limit]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = Number(btn.getAttribute("data-tier-limit"));
        closeMenu();
        if (next !== 5 && next !== 10) return;
        if (tierListLimit === next) return;
        tierListLimit = next;
        onChange?.();
      });
    });
  });
}

/**
 * When a date filter is active, show it as centered subtext under table/chart titles.
 * @param {HTMLElement} root
 * @param {string} [label]
 */
function injectDataFilterSubs(root, label) {
  const text = String(label || "").trim();
  if (!text) return;

  root.querySelectorAll(".card-title").forEach((title) => {
    if (!(title instanceof HTMLElement)) return;
    if (title.parentElement?.classList.contains("card-title-block")) return;
    const block = document.createElement("div");
    block.className = "card-title-block";
    title.replaceWith(block);
    block.appendChild(title);
    const sub = document.createElement("p");
    sub.className = "card-filter-sub";
    sub.textContent = text;
    block.appendChild(sub);
  });

  root.querySelectorAll(".mini-table-head > .mini-strategy").forEach((title) => {
    if (!(title instanceof HTMLElement)) return;
    const stack = document.createElement("div");
    stack.className = "mini-title-stack";
    title.replaceWith(stack);
    stack.appendChild(title);
    const sub = document.createElement("span");
    sub.className = "card-filter-sub";
    sub.textContent = text;
    stack.appendChild(sub);
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} viewId
 * @param {object} results
 * @param {{ error?: string, analytics?: object, users?: object[] } | null} [customers]
 * @param {{ dataFilterLabel?: string, games?: import("../data/games.js").GameRow[], fluxPeriod?: "daily"|"weekly"|"monthly", onFluxPeriodChange?: (p: "daily"|"weekly"|"monthly") => void, onSendToMedia?: (el: HTMLElement, label: string) => void | Promise<void> } & AdminOpts} [customerOpts]
 */
export function renderView(root, viewId, results, customers = null, customerOpts = {}) {
  root.classList.remove("hidden");
  const filterLabel = customerOpts.dataFilterLabel || "";
  const rerender = () => renderView(root, viewId, results, customers, customerOpts);

  if (viewId === "draftkings") {
    renderDraftKings(root, results);
    injectDataFilterSubs(root, filterLabel);
    wireTierListControls(root, rerender);
    wireMediaSendButtons(root, customerOpts.onSendToMedia);
    return;
  }
  if (viewId === "fanduel") {
    renderFanDuel(root, results);
    injectDataFilterSubs(root, filterLabel);
    wireTierListControls(root, rerender);
    wireMediaSendButtons(root, customerOpts.onSendToMedia);
    return;
  }
  if (viewId === "models") {
    renderModels(root, results);
    injectDataFilterSubs(root, filterLabel);
    wireTierListControls(root, rerender);
    wireMediaSendButtons(root, customerOpts.onSendToMedia);
    return;
  }
  if (viewId === "pitchers") {
    renderPitchers(root, results, customerOpts.games || []);
    injectDataFilterSubs(root, filterLabel);
    wirePitcherSelect(root, rerender);
    wireMediaSendButtons(root, customerOpts.onSendToMedia);
    return;
  }
  if (viewId === "games") {
    mountGamesPage(root, customerOpts.games || [], {
      dataFilterLabel: filterLabel,
      onSendToMedia: customerOpts.onSendToMedia,
    });
    return;
  }
  if (viewId === "umps") {
    mountUmpsPage(root, customerOpts.games || []);
    return;
  }
  if (viewId === "team") {
    mountTeamsPage(root, customerOpts.games || []);
    return;
  }
  if (viewId === "customers") {
    renderCustomers(root, customers, customerOpts);
    wireMediaSendButtons(root, customerOpts.onSendToMedia);
    return;
  }
  if (viewId === "admin") return renderAdmin(root, customers, customerOpts);
  if (viewId === "email") return renderEmail(root, customers, customerOpts);
  if (viewId === "site-alert") {
    if (!customerOpts.onRequestClient) {
      root.innerHTML = `<div class="book-theme-customers"><div class="page-header book-page-header book-customers"><h2 class="page-title">Site Alert</h2><p class="page-sub">Sign in required.</p></div></div>`;
      return;
    }
    mountSiteAlertPage(root, { onRequestClient: customerOpts.onRequestClient, busy: customerOpts.busy });
    return;
  }
  if (viewId === "media") {
    mountMediaCreatorPage(root);
    return;
  }
  renderDashboard(root, results);
  injectDataFilterSubs(root, filterLabel);
  wireTierListControls(root, rerender);
  wireMediaSendButtons(root, customerOpts.onSendToMedia);
}

export { navTitle };

