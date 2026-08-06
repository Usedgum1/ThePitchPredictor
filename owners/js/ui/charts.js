const ORANGE = "#ff942e";
const DK_GREEN = "#53d337";
const FD_BLUE = "#1493ff";
const GOLD = "#ffd84f";
const MUTED = "#a7afbc";
const TEXT = "#f4f0e8";

/** @type {import("chart.js").Chart | null} */
let monthlyChart = null;

/** @typedef {"daily"|"weekly"|"monthly"|"yearly"} ChartPeriod */
/** @type {ChartPeriod} */
let chartPeriod = "monthly";

/** @param {import("chart.js").Chart | null} chart */
export function destroyChart(chart) {
  chart?.destroy();
}

/** @returns {ChartPeriod} */
export function getChartPeriod() {
  return chartPeriod;
}

/** @param {ChartPeriod} period */
export function setChartPeriod(period) {
  chartPeriod = period;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ label?: string, month: string, dkWinRate: number, fdWinRate: number, ek0WinRate: number, ek1WinRate: number }[]} rows
 * @param {ChartPeriod} [period]
 */
export function renderMonthlyWinChart(canvas, rows, period = chartPeriod) {
  destroyChart(monthlyChart);
  if (typeof Chart === "undefined") return null;
  chartPeriod = period;
  const labels = rows.map((r) => r.label || r.month);
  const dense = rows.length > 40;
  monthlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "DK O/U", data: rows.map((r) => r.dkWinRate * 100), borderColor: DK_GREEN, backgroundColor: "transparent", tension: 0.25, pointRadius: dense ? 0 : 2, borderWidth: dense ? 1.5 : 2 },
        { label: "FD O/U", data: rows.map((r) => r.fdWinRate * 100), borderColor: FD_BLUE, backgroundColor: "transparent", tension: 0.25, pointRadius: dense ? 0 : 2, borderWidth: dense ? 1.5 : 2 },
        { label: "EK0", data: rows.map((r) => r.ek0WinRate * 100), borderColor: GOLD, backgroundColor: "transparent", tension: 0.25, pointRadius: dense ? 0 : 2, borderDash: [4, 4], borderWidth: dense ? 1.5 : 2 },
        { label: "EK-1", data: rows.map((r) => r.ek1WinRate * 100), borderColor: "#8d8aff", backgroundColor: "transparent", tension: 0.25, pointRadius: dense ? 0 : 2, borderDash: [2, 3], borderWidth: dense ? 1.5 : 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: TEXT, boxWidth: 10, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(255,148,46,0.3)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: {
            color: MUTED,
            maxRotation: dense ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: dense ? 12 : 24,
          },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: MUTED, callback: (v) => `${v}%` },
          grid: { color: "rgba(255,255,255,0.04)" },
          suggestedMin: 40,
          suggestedMax: 70,
        },
      },
    },
  });
  return monthlyChart;
}

/** @type {import("chart.js").Chart | null} */
let bookChart = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ month: string, winRate: number }[]} rows
 * @param {{ label?: string, color?: string }} [opts]
 */
export function renderBookWinChart(canvas, rows, opts = {}) {
  destroyChart(bookChart);
  if (typeof Chart === "undefined") return null;
  const color = opts.color || DK_GREEN;
  bookChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((r) => r.month),
      datasets: [
        {
          label: opts.label || "Win rate",
          data: rows.map((r) => r.winRate * 100),
          borderColor: color,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(83,211,55,0.35)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: MUTED, maxRotation: 0 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: {
          ticks: { color: MUTED, callback: (v) => `${v}%` },
          grid: { color: "rgba(255,255,255,0.04)" },
          suggestedMin: 40,
          suggestedMax: 70,
        },
      },
    },
  });
  return bookChart;
}

/** @type {import("chart.js").Chart | null} */
let modelHitChart = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ month: string, within1?: number, within2?: number, within3?: number, rates?: Record<number, number> }[]} rows
 */
export function renderModelHitChart(canvas, rows) {
  destroyChart(modelHitChart);
  if (typeof Chart === "undefined") return null;
  const series = [
    { key: 1, label: "Within 1 K", color: ORANGE, width: 2.5 },
    { key: 2, label: "Within 2 K", color: GOLD, width: 1.75 },
    { key: 3, label: "Within 3 K", color: "#2f9bff", width: 1.75 },
  ];
  modelHitChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((r) => r.month),
      datasets: series.map((s) => ({
        label: s.label,
        data: rows.map((r) => {
          const rate = r.rates?.[s.key] ?? (s.key === 1 ? r.within1 : s.key === 2 ? r.within2 : r.within3) ?? 0;
          return rate * 100;
        }),
        borderColor: s.color,
        backgroundColor: "transparent",
        tension: 0.25,
        pointRadius: rows.length > 24 ? 0 : 2,
        borderWidth: s.width,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(255,148,46,0.35)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: MUTED, maxRotation: 0 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: {
          ticks: { color: MUTED, callback: (v) => `${v}%` },
          grid: { color: "rgba(255,255,255,0.04)" },
          suggestedMin: 20,
          suggestedMax: 95,
        },
      },
    },
  });
  return modelHitChart;
}

/** @type {import("chart.js").Chart | null} */
let signupChart = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ month: string, signups: number }[]} rows
 */
export function renderSignupChart(canvas, rows) {
  destroyChart(signupChart);
  if (typeof Chart === "undefined") return null;
  const TEAL = "#2ec4b6";
  signupChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.month),
      datasets: [
        {
          label: "Signups",
          data: rows.map((r) => r.signups),
          backgroundColor: "rgba(46, 196, 182, 0.55)",
          borderColor: TEAL,
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(46,196,182,0.35)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: MUTED, maxRotation: 0 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: {
          ticks: { color: MUTED, precision: 0 },
          grid: { color: "rgba(255,255,255,0.04)" },
          beginAtZero: true,
        },
      },
    },
  });
  return signupChart;
}

/** @type {import("chart.js").Chart | null} */
let pageViewsChart = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ day: string, views: number, sessions: number }[]} rows
 */
export function renderPageViewsChart(canvas, rows) {
  destroyChart(pageViewsChart);
  if (typeof Chart === "undefined") return null;
  const TEAL = "#2ec4b6";
  const labels = rows.map((r) => {
    const parts = String(r.day || "").split("-");
    if (parts.length !== 3) return r.day;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  });
  pageViewsChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Page views",
          data: rows.map((r) => r.views),
          borderColor: ORANGE,
          backgroundColor: "rgba(255, 148, 46, 0.18)",
          fill: true,
          tension: 0.3,
          pointRadius: rows.length > 20 ? 0 : 2,
          borderWidth: 2,
        },
        {
          label: "Sessions",
          data: rows.map((r) => r.sessions),
          borderColor: TEAL,
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: rows.length > 20 ? 0 : 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: TEXT, boxWidth: 10, font: { size: 11 } },
        },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(255,148,46,0.3)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          ticks: { color: MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          ticks: { color: MUTED, precision: 0 },
          grid: { color: "rgba(255,255,255,0.04)" },
          beginAtZero: true,
        },
      },
    },
  });
  return pageViewsChart;
}

/** @type {import("chart.js").Chart | null} */
let subscribedChart = null;

/**
 * Doughnut of currently subscribed (active) customers by plan.
 * @param {HTMLCanvasElement} canvas
 * @param {{ plan: string, count: number, mrr?: number }[]} rows
 */
export function renderSubscribedChart(canvas, rows) {
  destroyChart(subscribedChart);
  if (typeof Chart === "undefined") return null;
  const colors = {
    Basic: "rgba(46, 196, 182, 0.85)",
    Pro: "rgba(255, 148, 46, 0.85)",
  };
  const borders = {
    Basic: "#2ec4b6",
    Pro: "#ff942e",
  };
  subscribedChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: rows.map((r) => r.plan),
      datasets: [
        {
          data: rows.map((r) => r.count),
          backgroundColor: rows.map((r) => colors[r.plan] || "rgba(167,175,188,0.55)"),
          borderColor: rows.map((r) => borders[r.plan] || MUTED),
          borderWidth: 1.5,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: TEXT, boxWidth: 10, font: { size: 11 }, padding: 14 },
        },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(46,196,182,0.35)",
          borderWidth: 1,
          callbacks: {
            label(ctx) {
              const row = rows[ctx.dataIndex];
              const n = row?.count ?? ctx.parsed;
              const mrr = row?.mrr != null ? ` · $${row.mrr}/mo` : "";
              return ` ${ctx.label}: ${n}${mrr}`;
            },
          },
        },
      },
    },
  });
  return subscribedChart;
}

/** @type {import("chart.js").Chart | null} */
let subFluxChart = null;

/** @type {"daily"|"weekly"|"monthly"} */
let customerFluxPeriod = "monthly";

/** @returns {"daily"|"weekly"|"monthly"} */
export function getCustomerFluxPeriod() {
  return customerFluxPeriod;
}

/** @param {"daily"|"weekly"|"monthly"} period */
export function setCustomerFluxPeriod(period) {
  customerFluxPeriod = period;
}

/**
 * Active Stripe subscriber count over time.
 * @param {HTMLCanvasElement} canvas
 * @param {{ label: string, active: number, basic?: number, pro?: number }[]} rows
 * @param {"daily"|"weekly"|"monthly"} [period]
 */
export function renderSubFluxChart(canvas, rows, period = customerFluxPeriod) {
  destroyChart(subFluxChart);
  if (typeof Chart === "undefined") return null;
  customerFluxPeriod = period;
  const dense = rows.length > 40;
  subFluxChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        {
          label: "Active subs",
          data: rows.map((r) => r.active),
          borderColor: "#2ec4b6",
          backgroundColor: "rgba(46, 196, 182, 0.12)",
          fill: true,
          tension: 0.25,
          pointRadius: dense ? 0 : 3,
          borderWidth: 2.5,
        },
        {
          label: "Basic",
          data: rows.map((r) => r.basic || 0),
          borderColor: "#1493ff",
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: dense ? 0 : 2,
          borderWidth: 1.5,
        },
        {
          label: "Pro",
          data: rows.map((r) => r.pro || 0),
          borderColor: ORANGE,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: dense ? 0 : 2,
          borderWidth: 1.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: TEXT, boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: "#12151f",
          titleColor: TEXT,
          bodyColor: MUTED,
          borderColor: "rgba(46,196,182,0.35)",
          borderWidth: 1,
        },
      },
      scales: {
        x: { ticks: { color: MUTED, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: {
          ticks: { color: MUTED, precision: 0 },
          grid: { color: "rgba(255,255,255,0.04)" },
          beginAtZero: true,
          suggestedMax: Math.max(4, ...rows.map((r) => r.active), 0) + 1,
        },
      },
    },
  });
  return subFluxChart;
}
