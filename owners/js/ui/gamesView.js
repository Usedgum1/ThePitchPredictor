import { fmtDate, fmtInt, fmtNum } from "./format.js";
import { resolveCaptureLabel, resolveCaptureRoot } from "../data/mediaCreator.js";

/**
 * @typedef {import("../data/games.js").GameRow} GameRow
 * @typedef {{
 *   id: string,
 *   label: string,
 *   align?: "left"|"center"|"right",
 *   outcome?: boolean,
 *   display: (g: GameRow) => string,
 *   sortValue: (g: GameRow) => string | number,
 * }} GamesColumn
 */

const PAGE_SIZE = 20;

/**
 * EK0 offset 0 / EK-1 offset 1: floor(PitchIQ) − offset as K+ ladder.
 * Win when actual ≥ threshold.
 * @param {GameRow} game
 * @param {number} offset
 */
function ekThreshold(game, offset = 0) {
  if (game.ensemble == null) return null;
  return Math.floor(game.ensemble) - offset;
}

/**
 * @param {GameRow} game
 * @param {number} offset
 * @returns {""|"Win"|"Loss"}
 */
function ekResult(game, offset = 0) {
  const threshold = ekThreshold(game, offset);
  if (threshold == null || game.actual == null) return "";
  return game.actual >= threshold ? "Win" : "Loss";
}

/** @param {string} value */
function outcomeTone(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "yes" || v === "w" || v.startsWith("win")) return "good";
  if (v === "no" || v === "l" || v.startsWith("loss")) return "bad";
  return "";
}

/** @type {GamesColumn[]} */
export const GAMES_COLUMNS = [
  {
    id: "date",
    label: "Date",
    align: "left",
    display: (g) => fmtDate(g.date),
    sortValue: (g) => (g.date ? g.date.getTime() : 0),
  },
  {
    id: "pitcher",
    label: "Pitcher",
    align: "left",
    display: (g) => g.pitcher || "—",
    sortValue: (g) => g.pitcher || "",
  },
  {
    id: "pitcherTeam",
    label: "Pitcher's Team",
    align: "left",
    display: (g) => g.pitcherTeam || "—",
    sortValue: (g) => g.pitcherTeam || "",
  },
  {
    id: "opponent",
    label: "Opponent",
    align: "left",
    display: (g) => g.opponent || "—",
    sortValue: (g) => g.opponent || "",
  },
  {
    id: "homeAway",
    label: "Home/Away",
    align: "center",
    display: (g) => g.homeAway || "—",
    sortValue: (g) => g.homeAway || "",
  },
  {
    id: "dkLine",
    label: "DK Line",
    align: "right",
    display: (g) => (g.dkLine == null ? "—" : fmtNum(g.dkLine, 1)),
    sortValue: (g) => g.dkLine ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "fdLine",
    label: "FD Line",
    align: "right",
    display: (g) => (g.fdLine == null ? "—" : fmtNum(g.fdLine, 1)),
    sortValue: (g) => g.fdLine ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "dkBet",
    label: "DK Bet",
    align: "center",
    display: (g) => g.dkBet || "—",
    sortValue: (g) => g.dkBet || "",
  },
  {
    id: "fdBet",
    label: "FD Bet",
    align: "center",
    display: (g) => g.fdBet || "—",
    sortValue: (g) => g.fdBet || "",
  },
  {
    id: "dkCorrect",
    label: "DK Correct",
    align: "center",
    outcome: true,
    display: (g) => g.dkCorrect || "—",
    sortValue: (g) => g.dkCorrect || "",
  },
  {
    id: "fdCorrect",
    label: "FD Correct",
    align: "center",
    outcome: true,
    display: (g) => g.fdCorrect || "—",
    sortValue: (g) => g.fdCorrect || "",
  },
  {
    id: "dkConfidence",
    label: "DK Conf",
    align: "center",
    display: (g) => g.dkConfidence || "—",
    sortValue: (g) => g.dkConfidence || "",
  },
  {
    id: "fdConfidence",
    label: "FD Conf",
    align: "center",
    display: (g) => g.fdConfidence || "—",
    sortValue: (g) => g.fdConfidence || "",
  },
  {
    id: "poisson",
    label: "Poisson",
    align: "right",
    display: (g) => (g.poisson == null ? "—" : fmtNum(g.poisson, 2)),
    sortValue: (g) => g.poisson ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "linear",
    label: "Linear",
    align: "right",
    display: (g) => (g.linear == null ? "—" : fmtNum(g.linear, 2)),
    sortValue: (g) => g.linear ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "nonlinear",
    label: "Nonlinear",
    align: "right",
    display: (g) => (g.nonlinear == null ? "—" : fmtNum(g.nonlinear, 2)),
    sortValue: (g) => g.nonlinear ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "ensemble",
    label: "PitchIQ",
    align: "right",
    display: (g) => (g.ensemble == null ? "—" : fmtNum(g.ensemble, 2)),
    sortValue: (g) => g.ensemble ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "actual",
    label: "Actual K",
    align: "right",
    display: (g) => (g.actual == null ? "—" : fmtInt(g.actual)),
    sortValue: (g) => g.actual ?? Number.NEGATIVE_INFINITY,
  },
  {
    id: "ek0",
    label: "EK0",
    align: "center",
    outcome: true,
    display: (g) => ekResult(g, 0) || "—",
    sortValue: (g) => ekResult(g, 0) || "",
  },
  {
    id: "ek1",
    label: "EK-1",
    align: "center",
    outcome: true,
    display: (g) => ekResult(g, 1) || "—",
    sortValue: (g) => ekResult(g, 1) || "",
  },
  {
    id: "vix",
    label: "VIX",
    align: "right",
    display: (g) => (g.vix == null ? "—" : fmtNum(g.vix, 2)),
    sortValue: (g) => g.vix ?? Number.NEGATIVE_INFINITY,
  },
];

/** @type {Record<string, string>} */
let columnFilters = Object.fromEntries(GAMES_COLUMNS.map((c) => [c.id, ""]));
let gamesPage = 1;
/** @type {string} */
let gamesSourceKey = "";
/** @type {"date"|"pitcher"|string} */
let sortColumn = "date";
/** @type {"asc"|"desc"} */
let sortDir = "desc";

/** @param {string} value */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filtersActive() {
  return GAMES_COLUMNS.some((c) => String(columnFilters[c.id] || "").trim());
}

function clearColumnFilters() {
  for (const col of GAMES_COLUMNS) columnFilters[col.id] = "";
  gamesPage = 1;
}

/**
 * @param {GameRow[]} games
 */
function filterGamesRows(games) {
  return games.filter((game) =>
    GAMES_COLUMNS.every((col) => {
      const needle = String(columnFilters[col.id] || "")
        .trim()
        .toLowerCase();
      if (!needle) return true;
      return col.display(game).toLowerCase().includes(needle);
    })
  );
}

/**
 * @param {GameRow[]} games
 */
function sortGamesRows(games) {
  const col = GAMES_COLUMNS.find((c) => c.id === sortColumn) || GAMES_COLUMNS[0];
  const dir = sortDir === "asc" ? 1 : -1;
  return [...games].sort((a, b) => {
    const av = col.sortValue(a);
    const bv = col.sortValue(b);
    if (typeof av === "number" && typeof bv === "number") {
      if (av === bv) return 0;
      return av < bv ? -dir : dir;
    }
    return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
  });
}

/**
 * @param {GameRow[]} games
 */
function summarizeFiltered(games) {
  let dkYes = 0;
  let dkNo = 0;
  let dkPush = 0;
  let fdYes = 0;
  let fdNo = 0;
  let fdPush = 0;
  let ek0Wins = 0;
  let ek0Losses = 0;
  let ek1Wins = 0;
  let ek1Losses = 0;
  for (const g of games) {
    const dk = String(g.dkCorrect || "").toLowerCase();
    const fd = String(g.fdCorrect || "").toLowerCase();
    if (dk === "yes") dkYes += 1;
    else if (dk === "no") dkNo += 1;
    else if (dk === "push") dkPush += 1;
    if (fd === "yes") fdYes += 1;
    else if (fd === "no") fdNo += 1;
    else if (fd === "push") fdPush += 1;
    const ek0 = ekResult(g, 0);
    if (ek0 === "Win") ek0Wins += 1;
    else if (ek0 === "Loss") ek0Losses += 1;
    const ek1 = ekResult(g, 1);
    if (ek1 === "Win") ek1Wins += 1;
    else if (ek1 === "Loss") ek1Losses += 1;
  }
  return {
    total: games.length,
    dkYes,
    dkNo,
    dkPush,
    fdYes,
    fdNo,
    fdPush,
    ek0Wins,
    ek0Losses,
    ek1Wins,
    ek1Losses,
  };
}

/**
 * @param {number} wins
 * @param {number} losses
 * @param {number} [pushes]
 */
function recordParts(label, wins, losses, pushes = 0) {
  const settled = wins + losses;
  const rate = settled ? Math.round((wins / settled) * 1000) / 10 : null;
  const parts = [`${label} ${fmtInt(wins)}–${fmtInt(losses)}`];
  if (pushes) parts.push(`${fmtInt(pushes)}P`);
  if (rate != null) parts.push(`${rate}%`);
  return parts.join(" · ");
}

/**
 * @param {ReturnType<typeof summarizeFiltered>} stats
 */
function filteredCountHtml(stats) {
  return `<div class="table-pager-summary" aria-live="polite">
    <span class="table-pager-summary-total">${fmtInt(stats.total)} game${stats.total === 1 ? "" : "s"}</span>
    <span class="table-pager-summary-sep" aria-hidden="true">·</span>
    <span class="table-pager-summary-book" title="DK correct among filtered rows">${escapeHtml(recordParts("DK", stats.dkYes, stats.dkNo, stats.dkPush))}</span>
    <span class="table-pager-summary-sep" aria-hidden="true">·</span>
    <span class="table-pager-summary-book" title="FD correct among filtered rows">${escapeHtml(recordParts("FD", stats.fdYes, stats.fdNo, stats.fdPush))}</span>
    <span class="table-pager-summary-sep" aria-hidden="true">·</span>
    <span class="table-pager-summary-book" title="EK0 among filtered rows">${escapeHtml(recordParts("EK0", stats.ek0Wins, stats.ek0Losses))}</span>
    <span class="table-pager-summary-sep" aria-hidden="true">·</span>
    <span class="table-pager-summary-book" title="EK-1 among filtered rows">${escapeHtml(recordParts("EK-1", stats.ek1Wins, stats.ek1Losses))}</span>
  </div>`;
}

/**
 * @param {number} total
 * @param {number} page
 * @param {number} pageSize
 * @param {GameRow[]} filtered
 */
function pagerHtml(total, page, pageSize, filtered) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);
  const stats = summarizeFiltered(filtered);

  /** @type {number[]} */
  const pages = [];
  const window = 2;
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= safePage - window && i <= safePage + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1);
    }
  }

  return `<div class="table-pager table-pager--games" role="navigation" aria-label="Games pages">
    <span class="table-pager-meta">${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(total)}</span>
    ${filteredCountHtml(stats)}
    <div class="table-pager-controls">
      <button type="button" class="table-pager-btn" data-games-page="${safePage - 1}" ${safePage <= 1 ? "disabled" : ""} aria-label="Previous page">Prev</button>
      ${pages
        .map((p) =>
          p < 0
            ? `<span class="table-pager-ellipsis" aria-hidden="true">…</span>`
            : `<button type="button" class="table-pager-btn${p === safePage ? " is-active" : ""}" data-games-page="${p}" aria-label="Page ${p}" ${p === safePage ? 'aria-current="page"' : ""}>${p}</button>`
        )
        .join("")}
      <button type="button" class="table-pager-btn" data-games-page="${safePage + 1}" ${safePage >= totalPages ? "disabled" : ""} aria-label="Next page">Next</button>
    </div>
  </div>`;
}

function captureFocus(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) {
    return () => {};
  }
  const focusId = active.id;
  const focusStart = active instanceof HTMLInputElement ? active.selectionStart : null;
  const focusEnd = active instanceof HTMLInputElement ? active.selectionEnd : null;
  return () => {
    if (!focusId) return;
    const next = /** @type {HTMLInputElement | null} */ (root.querySelector(`#${CSS.escape(focusId)}`));
    if (!next) return;
    next.focus({ preventScroll: true });
    if (focusStart != null && focusEnd != null) {
      try {
        next.setSelectionRange(focusStart, focusEnd);
      } catch {
        /* ignore */
      }
    }
  };
}

/**
 * @param {HTMLElement} root
 */
function captureViewState(root) {
  const tableScroll = root.querySelector(".games-table-scroll");
  const content = document.querySelector(".content");
  return {
    restoreFocus: captureFocus(root),
    windowX: window.scrollX,
    windowY: window.scrollY,
    contentTop: content instanceof HTMLElement ? content.scrollTop : 0,
    tableLeft: tableScroll instanceof HTMLElement ? tableScroll.scrollLeft : 0,
    tableTop: tableScroll instanceof HTMLElement ? tableScroll.scrollTop : 0,
  };
}

/**
 * @param {HTMLElement} root
 * @param {ReturnType<typeof captureViewState>} state
 */
function restoreViewState(root, state) {
  const apply = () => {
    const content = document.querySelector(".content");
    if (content instanceof HTMLElement) content.scrollTop = state.contentTop;
    window.scrollTo(state.windowX, state.windowY);
    const tableScroll = root.querySelector(".games-table-scroll");
    if (tableScroll instanceof HTMLElement) {
      tableScroll.scrollLeft = state.tableLeft;
      tableScroll.scrollTop = state.tableTop;
    }
    state.restoreFocus();
  };
  apply();
  requestAnimationFrame(apply);
}

/**
 * @param {HTMLElement} root
 * @param {(el: HTMLElement, label: string) => void | Promise<void>} [onSendToMedia]
 */
function wireGamesMediaSend(root, onSendToMedia) {
  if (!onSendToMedia) return;
  root.querySelectorAll(".media-send-btn").forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
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
 * @param {HTMLElement} root
 * @param {GameRow[]} games
 * @param {{ dataFilterLabel?: string, onSendToMedia?: (el: HTMLElement, label: string) => void | Promise<void> }} [opts]
 */
export function mountGamesPage(root, games, opts = {}) {
  const list = Array.isArray(games) ? games : [];
  const sourceKey = `${list.length}:${list[0]?.date?.getTime() ?? 0}:${list[list.length - 1]?.date?.getTime() ?? 0}`;
  if (sourceKey !== gamesSourceKey) {
    gamesSourceKey = sourceKey;
    gamesPage = 1;
  }

  function paint() {
    const viewState = captureViewState(root);
    const filtered = sortGamesRows(filterGamesRows(list));
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (gamesPage > totalPages) gamesPage = totalPages;
    if (gamesPage < 1) gamesPage = 1;
    const start = (gamesPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);
    const activeFilters = filtersActive();
    const filterLabel = String(opts.dataFilterLabel || "").trim();

    const labelCells = GAMES_COLUMNS.map((col) => {
      const sorted = sortColumn === col.id;
      const arrow = sorted ? (sortDir === "asc" ? " ▲" : " ▼") : "";
      const align = col.align === "right" ? "num" : col.align === "center" ? "col-center" : "col-text";
      return `<th class="${align}">
        <button type="button" class="games-sort-btn" data-games-sort="${escapeHtml(col.id)}">
          ${escapeHtml(col.label)}${arrow}
        </button>
      </th>`;
    }).join("");

    const filterCells = GAMES_COLUMNS.map((col) => {
      const align = col.align === "right" ? "num" : col.align === "center" ? "col-center" : "col-text";
      return `<th class="${align} games-filter-cell">
        <input
          id="games-filter-${escapeHtml(col.id)}"
          class="games-col-filter"
          type="search"
          data-games-filter="${escapeHtml(col.id)}"
          value="${escapeHtml(columnFilters[col.id] || "")}"
          placeholder="Filter"
          aria-label="Filter ${escapeHtml(col.label)}"
        />
      </th>`;
    }).join("");

    const body = pageRows
      .map((game) => {
        const cells = GAMES_COLUMNS.map((col) => {
          const align = col.align === "right" ? "num" : col.align === "center" ? "col-center" : "col-text";
          const text = col.display(game);
          if (col.outcome) {
            const tone = outcomeTone(text);
            const inner = tone
              ? `<span class="games-outcome pct-value pct-${tone}">${escapeHtml(text)}</span>`
              : escapeHtml(text);
            return `<td class="${align}">${inner}</td>`;
          }
          return `<td class="${align}">${escapeHtml(text)}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    root.innerHTML = `
      <div class="book-theme-games games-page">
        <div class="page-header book-page-header book-games">
          <div class="admin-page-head">
            <div>
              <h2 class="page-title">Games</h2>
              <p class="page-sub">${fmtInt(list.length)} games in range · filter any column · ${PAGE_SIZE} per page</p>
            </div>
            <div class="games-header-actions">
              <button type="button" class="btn btn-ghost btn-sm" id="games-clear-filters" ${activeFilters ? "" : "disabled"}>Clear column filters</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title-block">
            <h3 class="card-title">All games</h3>
            ${filterLabel ? `<p class="card-filter-sub">${escapeHtml(filterLabel)}</p>` : ""}
          </div>
          <p class="page-sub muted" style="margin:-0.15rem 0 0.75rem; text-align:center;">
            ${fmtInt(filtered.length)} match${filtered.length === 1 ? "" : "es"}${activeFilters ? " after column filters" : ""}
          </p>
          <div class="media-capture-block" data-media-label="All games">
            <div class="media-capture-toolbar">
              <button type="button" class="media-send-btn" title="Send this table to Media Creator as an image" aria-label="Send this table to Media Creator as an image">
                <span class="media-send-glyph" aria-hidden="true">⧉</span>
              </button>
            </div>
            <div class="table-shell table-theme-games">
              <div class="table-scroll games-table-scroll">
                <table class="data-table games-data-table">
                  <thead>
                    <tr>${labelCells}</tr>
                    <tr class="games-filter-row">${filterCells}</tr>
                  </thead>
                  <tbody>
                    ${
                      body ||
                      `<tr><td class="col-center mini-empty" colspan="${GAMES_COLUMNS.length}">No games match the current filters.</td></tr>`
                    }
                  </tbody>
                </table>
              </div>
            </div>
            ${pagerHtml(filtered.length, gamesPage, PAGE_SIZE, filtered)}
          </div>
        </div>
      </div>`;

    wire(paint);
    wireGamesMediaSend(root, opts.onSendToMedia);
    restoreViewState(root, viewState);
  }

  /**
   * @param {() => void} repaint
   */
  function wire(repaint) {
    root.querySelectorAll("[data-games-filter]").forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.addEventListener("input", () => {
        const id = input.getAttribute("data-games-filter");
        if (!id) return;
        columnFilters[id] = input.value;
        repaint();
      });
    });

    root.querySelectorAll("[data-games-sort]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-games-sort");
        if (!id) return;
        if (sortColumn === id) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
          sortColumn = id;
          sortDir = id === "date" ? "desc" : "asc";
        }
        repaint();
      });
    });

    root.querySelectorAll("[data-games-page]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const next = Number(btn.getAttribute("data-games-page"));
        if (!Number.isFinite(next) || next < 1) return;
        gamesPage = next;
        repaint();
      });
    });

    root.querySelector("#games-clear-filters")?.addEventListener("click", () => {
      clearColumnFilters();
      repaint();
    });
  }

  paint();
}
