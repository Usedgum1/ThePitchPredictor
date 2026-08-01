/** @typedef {{ dataUrl: string, sourceLabel: string, capturedAt: string }} MediaDraft */

/** @type {MediaDraft | null} */
let pendingImage = null;

/** @type {Promise<typeof import("html-to-image")> | null} */
let htmlToImagePromise = null;

export const MEDIA_LOGO_SRC = "images/PitchIQ%20Logo.png";
export const MEDIA_STAMP_TEXT = "ThePitchPredictor.com";

/** Social / export format presets (letterboxed preview + download). */
export const MEDIA_FORMAT_PRESETS = Object.freeze([
  { id: "generic", label: "Generic", shortLabel: "Generic", width: null, height: null, hint: "Original size" },
  { id: "instagram-feed", label: "Instagram", shortLabel: "IG Feed", width: 1080, height: 1350, hint: "1080×1350 · 4:5" },
  { id: "instagram-story", label: "Instagram Story", shortLabel: "IG Story", width: 1080, height: 1920, hint: "1080×1920 · 9:16" },
  { id: "facebook", label: "Facebook", shortLabel: "Facebook", width: 1200, height: 630, hint: "1200×630" },
  { id: "facebook-square", label: "Facebook Square", shortLabel: "FB Square", width: 1080, height: 1080, hint: "1080×1080" },
  { id: "x", label: "X / Twitter", shortLabel: "X", width: 1600, height: 900, hint: "1600×900 · 16:9" },
]);

/** @deprecated use MEDIA_FORMAT_PRESETS */
export const MEDIA_DOWNLOAD_PRESETS = MEDIA_FORMAT_PRESETS;

/**
 * @param {string} id
 */
export function getMediaFormat(id) {
  return MEDIA_FORMAT_PRESETS.find((p) => p.id === id) || MEDIA_FORMAT_PRESETS[0];
}

/**
 * Draw an image letterboxed into a canvas size (no crop).
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} source
 * @param {number} tw
 * @param {number} th
 * @param {string} [fill="#0c0e14"]
 */
export function drawLetterboxed(ctx, source, tw, th, fill = "#0c0e14") {
  const sw = /** @type {HTMLImageElement} */ (source).naturalWidth || /** @type {HTMLCanvasElement} */ (source).width || 0;
  const sh = /** @type {HTMLImageElement} */ (source).naturalHeight || /** @type {HTMLCanvasElement} */ (source).height || 0;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, tw, th);
  if (!sw || !sh) return;
  const scale = Math.min(tw / sw, th / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const dx = Math.round((tw - dw) / 2);
  const dy = Math.round((th - dh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, sw, sh, dx, dy, dw, dh);
}

/**
 * Fit source canvas into a target size with letterboxing (no crop).
 * @param {HTMLCanvasElement} source
 * @param {{ width: number | null, height: number | null }} size
 * @param {string} [fill="#0c0e14"]
 */
export function renderExportCanvas(source, size, fill = "#0c0e14") {
  const out = document.createElement("canvas");
  const sw = source.width;
  const sh = source.height;
  if (!size.width || !size.height) {
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.drawImage(source, 0, 0);
    return out;
  }

  out.width = size.width;
  out.height = size.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  drawLetterboxed(ctx, source, size.width, size.height, fill);
  return out;
}

/** @returns {MediaDraft | null} */
export function getMediaDraft() {
  return pendingImage;
}

/** @param {MediaDraft | null} draft */
export function setMediaDraft(draft) {
  pendingImage = draft;
}

export function clearMediaDraft() {
  pendingImage = null;
}

/**
 * Load an uploaded image file into the media draft.
 * @param {File} file
 */
export async function loadImageFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Choose an image file (PNG, JPG, WebP, etc.).");
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image file."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });

  // Ensure the browser can decode it before composing.
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(undefined);
    img.onerror = () => reject(new Error("That file could not be opened as an image."));
    img.src = dataUrl;
  });

  const label = String(file.name || "Uploaded image").replace(/\.[^.]+$/, "").trim() || "Uploaded image";
  const draft = {
    dataUrl,
    sourceLabel: label.slice(0, 80),
    capturedAt: new Date().toISOString(),
  };
  pendingImage = draft;
  return draft;
}

async function loadHtmlToImage() {
  if (!htmlToImagePromise) {
    htmlToImagePromise = import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm");
  }
  return htmlToImagePromise;
}

/**
 * Capture a DOM node (table card / mini card) to a PNG data URL.
 * @param {HTMLElement} el
 * @param {string} [label]
 */
export async function captureTableElement(el, label = "Table") {
  const htmlToImage = await loadHtmlToImage();
  const dataUrl = await htmlToImage.toPng(el, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#0c0e14",
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.classList.contains("media-send-btn")) return false;
      if (node.classList.contains("media-capture-toolbar")) return false;
      if (node.classList.contains("tier-limit-menu")) return false;
      return true;
    },
  });
  const draft = {
    dataUrl,
    sourceLabel: String(label || "Table").trim() || "Table",
    capturedAt: new Date().toISOString(),
  };
  pendingImage = draft;
  return draft;
}

/**
 * Resolve the best capture root from a send button.
 * Prefer the parent card (includes title) when available.
 * @param {HTMLElement} button
 */
export function resolveCaptureRoot(button) {
  const card = button.closest(".card");
  if (card?.querySelector(".card-title")) return card;

  return (
    button.closest(".mini-table-card") ||
    button.closest(".media-capture-block") ||
    button.closest(".table-shell") ||
    button.parentElement
  );
}

/**
 * @param {HTMLElement} root
 */
export function resolveCaptureLabel(root) {
  const titled =
    root.querySelector(".card-title")?.textContent ||
    root.querySelector(".mini-strategy")?.textContent ||
    root.getAttribute("data-media-label") ||
    "Table";
  return String(titled).trim() || "Table";
}
