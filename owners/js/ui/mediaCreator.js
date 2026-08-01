import {
  MEDIA_FORMAT_PRESETS,
  MEDIA_LOGO_SRC,
  MEDIA_STAMP_TEXT,
  clearMediaDraft,
  drawLetterboxed,
  getMediaDraft,
  getMediaFormat,
  loadImageFile,
} from "../data/mediaCreator.js";

/** @type {string} */
let formatId = "generic";
/** @type {"tl"|"tr"|"bl"|"br"} */
let corner = "br";
/** Watermark logo width as fraction of canvas width */
let scale = 0.12;
/** Preview pane zoom (1 = fit width) */
let previewZoom = 1;
const PREVIEW_ZOOM_MIN = 0.25;
const PREVIEW_ZOOM_MAX = 4;
const PREVIEW_ZOOM_STEP = 0.1;
/**
 * Custom watermark block top-left as fractions of canvas (0–1).
 * Null = snap to selected corner.
 * @type {{ x: number, y: number } | null}
 */
let customPos = null;

/** Last drawn watermark hit box in canvas pixels */
/** @type {{ x: number, y: number, w: number, h: number } | null} */
let watermarkBounds = null;

/** @type {HTMLImageElement | null} */
let logoImage = null;
/** @type {Promise<HTMLImageElement> | null} */
let logoPromise = null;
/** @type {HTMLImageElement | null} */
let sourceImage = null;
/** @type {string | null} */
let sourceImageUrl = null;
/** @type {Promise<HTMLImageElement> | null} */
let sourcePromise = null;
/** Compose generation token to ignore stale async redraws */
let composeToken = 0;

function loadLogo() {
  if (logoImage?.complete && logoImage.naturalWidth) return Promise.resolve(logoImage);
  if (logoPromise) return logoPromise;
  logoPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      logoImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error("Failed to load PitchIQ logo."));
    img.src = MEDIA_LOGO_SRC;
  });
  return logoPromise;
}

/** @param {string} dataUrl */
function loadSource(dataUrl) {
  if (sourceImage && sourceImageUrl === dataUrl && sourceImage.complete) {
    return Promise.resolve(sourceImage);
  }
  if (sourcePromise && sourceImageUrl === dataUrl) return sourcePromise;
  sourceImageUrl = dataUrl;
  sourcePromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      resolve(img);
    };
    img.onerror = () => reject(new Error("Failed to load captured image."));
    img.src = dataUrl;
  });
  return sourcePromise;
}

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

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {"left"|"right"|"center"} align
 */
function drawStampedText(ctx, text, x, y, fontSize, align) {
  ctx.save();
  ctx.font = `700 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(2.5, fontSize * 0.22);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#ffffff";
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * @param {number} w
 * @param {number} h
 * @param {number} blockW
 * @param {number} blockH
 * @param {number} margin
 */
function cornerBlockOrigin(w, h, blockW, blockH, margin) {
  if (corner === "tr") return { x: w - margin - blockW, y: margin };
  if (corner === "bl") return { x: margin, y: h - margin - blockH };
  if (corner === "br") return { x: w - margin - blockW, y: h - margin - blockH };
  return { x: margin, y: margin };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} sourceDataUrl
 * @param {{ formatId: string, corner: "tl"|"tr"|"bl"|"br", scale: number, customPos: { x: number, y: number } | null }} opts
 */
async function composePreview(canvas, sourceDataUrl, opts) {
  const token = ++composeToken;
  const [source, logo] = await Promise.all([loadSource(sourceDataUrl), loadLogo()]);
  if (token !== composeToken) return watermarkBounds;

  const format = getMediaFormat(opts.formatId);

  const srcW = source.naturalWidth || source.width;
  const srcH = source.naturalHeight || source.height;
  const w = format.width || srcW;
  const h = format.height || srcH;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  if (format.width && format.height) {
    drawLetterboxed(ctx, source, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
  }

  const logoW = Math.max(48, Math.round(w * opts.scale));
  const logoH = Math.round((logo.naturalHeight / logo.naturalWidth) * logoW);
  const fontSize = Math.max(11, Math.round(logoW * 0.18));
  const gap = Math.round(logoW * 0.08);
  const stampH = fontSize + 2;
  const blockH = logoH + gap + stampH;
  const margin = Math.max(16, Math.round(w * 0.025));

  ctx.save();
  ctx.font = `700 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  const textW = Math.ceil(ctx.measureText(MEDIA_STAMP_TEXT).width);
  ctx.restore();

  const blockW = Math.max(logoW, textW);
  let blockX;
  let blockY;

  if (opts.customPos) {
    blockX = opts.customPos.x * w;
    blockY = opts.customPos.y * h;
  } else {
    const origin = cornerBlockOrigin(w, h, blockW, blockH, margin);
    blockX = origin.x;
    blockY = origin.y;
  }

  blockX = Math.max(0, Math.min(w - blockW, blockX));
  blockY = Math.max(0, Math.min(h - blockH, blockY));

  const logoX = blockX + (blockW - logoW) / 2;
  const textX = blockX + blockW / 2;

  ctx.drawImage(logo, logoX, blockY, logoW, logoH);
  drawStampedText(ctx, MEDIA_STAMP_TEXT, textX, blockY + logoH + gap, fontSize, "center");

  watermarkBounds = { x: blockX, y: blockY, w: blockW, h: blockH };
  return watermarkBounds;
}

/**
 * @param {HTMLElement} root
 */
function paint(root) {
  const draft = getMediaDraft();
  const hasImage = Boolean(draft);
  const format = getMediaFormat(formatId);
  const meta = hasImage
    ? `${escapeHtml(draft.sourceLabel)} · ${escapeHtml(fmtWhen(draft.capturedAt))}`
    : "Upload an image or send a table with the ⧉ icon";
  const formatMeta = format.width
    ? `${escapeHtml(format.label)} · ${format.width}×${format.height}`
    : "Generic · original size";

  root.innerHTML = `
    <div class="book-theme-customers media-page" data-media-root="1">
      <div class="page-header book-page-header book-customers">
        <div class="admin-page-head">
          <div>
            <h2 class="page-title">Media Creator</h2>
            <p class="page-sub">Drop in an image, pick a social format, place the PitchIQ watermark, then download.</p>
          </div>
          <div class="media-header-actions">
            <input id="media-file-input" type="file" accept="image/*" hidden />
            <button type="button" class="btn btn-ghost btn-sm" id="media-upload">Upload image</button>
          </div>
        </div>
      </div>

      <div class="media-studio">
        <div class="card media-preview-card">
          <div class="admin-master-head media-preview-head">
            <div>
              <h3 class="card-title">Preview</h3>
              <p class="page-sub muted" style="margin:0.15rem 0 0;">${meta}</p>
              <p class="page-sub muted media-format-meta" id="media-format-meta">${formatMeta}</p>
            </div>
            <div class="media-zoom-controls" role="group" aria-label="Preview zoom">
              <button type="button" class="media-zoom-btn" id="media-zoom-out" title="Zoom out" ${hasImage ? "" : "disabled"} aria-label="Zoom out">−</button>
              <span class="media-zoom-value" id="media-zoom-value">${Math.round(previewZoom * 100)}%</span>
              <button type="button" class="media-zoom-btn" id="media-zoom-in" title="Zoom in" ${hasImage ? "" : "disabled"} aria-label="Zoom in">+</button>
              <button type="button" class="media-zoom-btn media-zoom-reset" id="media-zoom-reset" title="Reset zoom" ${hasImage ? "" : "disabled"}>Fit</button>
            </div>
          </div>
          <div class="media-canvas-wrap${hasImage ? "" : " is-blank"}" id="media-drop-zone" title="${hasImage ? "Scroll wheel to zoom" : ""}">
            ${
              hasImage
                ? `<div class="media-canvas-stage" id="media-canvas-stage" style="width:${(previewZoom * 100).toFixed(2)}%">
                    <canvas id="media-compose-canvas" class="media-compose-canvas" aria-label="Formatted preview with watermark. Drag watermark to reposition. Scroll wheel to zoom."></canvas>
                  </div>`
                : `<div class="media-blank-stage" aria-hidden="true">
                    <span class="media-blank-label">Drop an image here or upload</span>
                  </div>`
            }
          </div>
        </div>

        <div class="card media-controls-card">
          <h3 class="card-title">Format</h3>
          <p class="page-sub" style="margin:0.35rem 0 0.75rem;">Builds the preview to that platform’s post size</p>
          <div class="media-format-pad" role="group" aria-label="Social format">
            ${MEDIA_FORMAT_PRESETS.map(
              (preset) => `<button type="button" class="media-format-btn${formatId === preset.id ? " is-active" : ""}" data-media-format="${escapeHtml(preset.id)}" title="${escapeHtml(preset.hint)}">
                <span class="media-format-btn-label">${escapeHtml(preset.shortLabel)}</span>
                <span class="media-format-btn-hint">${escapeHtml(preset.hint)}</span>
              </button>`
            ).join("")}
          </div>

          <h3 class="card-title" style="margin-top:1.25rem;">Watermark</h3>
          <p class="page-sub" style="margin:0.35rem 0 0.85rem;">Logo + ${escapeHtml(MEDIA_STAMP_TEXT)} · drag on the preview for custom placement</p>

          <div class="media-controls-row">
            <div>
              <p class="media-control-label">Snap corner</p>
              <div class="media-corner-pad" role="group" aria-label="Watermark corner">
                <button type="button" class="media-corner-btn${corner === "tl" && !customPos ? " is-active" : ""}" data-media-corner="tl" title="Top left">TL</button>
                <button type="button" class="media-corner-btn${corner === "tr" && !customPos ? " is-active" : ""}" data-media-corner="tr" title="Top right">TR</button>
                <button type="button" class="media-corner-btn${corner === "bl" && !customPos ? " is-active" : ""}" data-media-corner="bl" title="Bottom left">BL</button>
                <button type="button" class="media-corner-btn${corner === "br" && !customPos ? " is-active" : ""}" data-media-corner="br" title="Bottom right">BR</button>
              </div>
            </div>

            <label class="media-scale-field">
              <span class="media-control-label">Size <span id="media-scale-value">${Math.round(scale * 100)}%</span></span>
              <input id="media-scale" type="range" min="6" max="28" step="1" value="${Math.round(scale * 100)}" />
            </label>

            <div class="media-actions">
              <button type="button" class="btn btn-ghost" id="media-upload-inline">Upload image</button>
              <button type="button" class="btn btn-primary" id="media-download" ${hasImage ? "" : "disabled"}>Download PNG</button>
              <button type="button" class="btn btn-ghost" id="media-clear" ${hasImage ? "" : "disabled"}>Clear</button>
            </div>
          </div>
          <p class="page-sub muted" id="media-status" style="margin:0.75rem 0 0;"></p>
        </div>
      </div>
    </div>`;

  wireStudio(root);
  if (hasImage) {
    refreshCanvas(root).catch((error) => {
      const status = root.querySelector("#media-status");
      if (status) status.textContent = error?.message || "Failed to compose preview.";
    });
  } else {
    watermarkBounds = null;
  }
}

/**
 * @param {HTMLElement} root
 */
async function refreshCanvas(root) {
  const draft = getMediaDraft();
  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#media-compose-canvas"));
  if (!draft || !canvas) return;
  await composePreview(canvas, draft.dataUrl, { formatId, corner, scale, customPos });
  syncFormatMeta(root);
  syncCornerActive(root);
}

/** @param {HTMLElement} root */
function syncFormatMeta(root) {
  const el = root.querySelector("#media-format-meta");
  const format = getMediaFormat(formatId);
  if (!el) return;
  el.textContent = format.width
    ? `${format.label} · ${format.width}×${format.height}`
    : "Generic · original size";
}

/** @param {HTMLElement} root */
function syncCornerActive(root) {
  root.querySelectorAll("[data-media-corner]").forEach((b) => {
    const id = b.getAttribute("data-media-corner");
    b.classList.toggle("is-active", !customPos && id === corner);
  });
}

/**
 * @param {number} next
 */
function clampPreviewZoom(next) {
  const stepped = Math.round(next / PREVIEW_ZOOM_STEP) * PREVIEW_ZOOM_STEP;
  return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, Number(stepped.toFixed(2))));
}

/**
 * @param {HTMLElement} root
 * @param {number} next
 * @param {{ anchorX?: number, anchorY?: number } | null} [anchor] client coords inside wrap for scroll-follow
 */
function applyPreviewZoom(root, next, anchor = null) {
  const wrap = /** @type {HTMLElement | null} */ (root.querySelector("#media-drop-zone"));
  const stage = /** @type {HTMLElement | null} */ (root.querySelector("#media-canvas-stage"));
  const valueEl = root.querySelector("#media-zoom-value");
  const zoomOut = /** @type {HTMLButtonElement | null} */ (root.querySelector("#media-zoom-out"));
  const zoomIn = /** @type {HTMLButtonElement | null} */ (root.querySelector("#media-zoom-in"));
  if (!stage || !wrap) return;

  const prevZoom = previewZoom;
  previewZoom = clampPreviewZoom(next);

  let relX = 0.5;
  let relY = 0.5;
  if (anchor && Number.isFinite(anchor.anchorX) && Number.isFinite(anchor.anchorY)) {
    relX = (wrap.scrollLeft + (anchor.anchorX - wrap.getBoundingClientRect().left)) / Math.max(1, wrap.scrollWidth);
    relY = (wrap.scrollTop + (anchor.anchorY - wrap.getBoundingClientRect().top)) / Math.max(1, wrap.scrollHeight);
  } else if (prevZoom > 0) {
    relX = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, wrap.scrollWidth);
    relY = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, wrap.scrollHeight);
  }

  stage.style.width = `${(previewZoom * 100).toFixed(2)}%`;
  if (valueEl) valueEl.textContent = `${Math.round(previewZoom * 100)}%`;
  if (zoomOut) zoomOut.disabled = previewZoom <= PREVIEW_ZOOM_MIN;
  if (zoomIn) zoomIn.disabled = previewZoom >= PREVIEW_ZOOM_MAX;

  // Keep focal point roughly stable after layout
  requestAnimationFrame(() => {
    const maxScrollX = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
    const maxScrollY = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
    wrap.scrollLeft = Math.min(maxScrollX, Math.max(0, relX * wrap.scrollWidth - wrap.clientWidth / 2));
    wrap.scrollTop = Math.min(maxScrollY, Math.max(0, relY * wrap.scrollHeight - wrap.clientHeight / 2));
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MouseEvent | PointerEvent} event
 */
function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / Math.max(1, rect.width);
  const sy = canvas.height / Math.max(1, rect.height);
  return {
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy,
  };
}

/**
 * @param {number} px
 * @param {number} py
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {number} [pad=8]
 */
function hitWatermark(px, py, box, pad = 8) {
  return px >= box.x - pad && px <= box.x + box.w + pad && py >= box.y - pad && py <= box.y + box.h + pad;
}

/**
 * @param {HTMLElement} root
 */
function wireStudio(root) {
  const fileInput = /** @type {HTMLInputElement | null} */ (root.querySelector("#media-file-input"));
  const statusEl = root.querySelector("#media-status");

  /**
   * @param {File | undefined | null} file
   */
  async function ingestFile(file) {
    if (!file) return;
    try {
      if (statusEl) statusEl.textContent = "Loading image…";
      await loadImageFile(file);
      paint(root);
    } catch (error) {
      if (statusEl) statusEl.textContent = error?.message || "Upload failed.";
    }
  }

  const openPicker = () => fileInput?.click();
  root.querySelector("#media-upload")?.addEventListener("click", openPicker);
  root.querySelector("#media-upload-inline")?.addEventListener("click", openPicker);

  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    ingestFile(file).catch(() => {});
  });

  const dropZone = root.querySelector("#media-drop-zone");
  if (dropZone) {
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragover");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("is-dragover");
    });
    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragover");
      const file = event.dataTransfer?.files?.[0];
      ingestFile(file).catch(() => {});
    });

    dropZone.addEventListener(
      "wheel",
      (event) => {
        if (!getMediaDraft()) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? -1 : 1;
        const intensity = Math.min(3, Math.max(1, Math.abs(event.deltaY) / 100));
        applyPreviewZoom(root, previewZoom + direction * PREVIEW_ZOOM_STEP * intensity, {
          anchorX: event.clientX,
          anchorY: event.clientY,
        });
      },
      { passive: false }
    );
  }

  root.querySelector("#media-zoom-in")?.addEventListener("click", () => {
    applyPreviewZoom(root, previewZoom + PREVIEW_ZOOM_STEP * 2);
  });
  root.querySelector("#media-zoom-out")?.addEventListener("click", () => {
    applyPreviewZoom(root, previewZoom - PREVIEW_ZOOM_STEP * 2);
  });
  root.querySelector("#media-zoom-reset")?.addEventListener("click", () => {
    applyPreviewZoom(root, 1);
  });

  // Sync button disabled state for current zoom
  applyPreviewZoom(root, previewZoom);

  root.querySelectorAll("[data-media-format]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-media-format");
      if (!next || !getMediaFormat(next)) return;
      formatId = next;
      root.querySelectorAll("[data-media-format]").forEach((b) => {
        b.classList.toggle("is-active", b.getAttribute("data-media-format") === formatId);
      });
      // Keep relative watermark placement when switching formats
      refreshCanvas(root).catch(() => {});
      if (statusEl) {
        const format = getMediaFormat(formatId);
        statusEl.textContent = format.width
          ? `Preview set to ${format.label} (${format.width}×${format.height}).`
          : "Preview set to original size.";
      }
    });
  });

  root.querySelectorAll("[data-media-corner]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-media-corner");
      if (next !== "tl" && next !== "tr" && next !== "bl" && next !== "br") return;
      corner = next;
      customPos = null;
      syncCornerActive(root);
      refreshCanvas(root).catch(() => {});
    });
  });

  const scaleInput = /** @type {HTMLInputElement | null} */ (root.querySelector("#media-scale"));
  const scaleValue = root.querySelector("#media-scale-value");
  scaleInput?.addEventListener("input", () => {
    scale = Math.min(0.28, Math.max(0.06, Number(scaleInput.value) / 100));
    if (scaleValue) scaleValue.textContent = `${Math.round(scale * 100)}%`;
    refreshCanvas(root).catch(() => {});
  });

  const canvas = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#media-compose-canvas"));
  if (canvas) {
    /** @type {{ ox: number, oy: number, raf: number } | null} */
    let drag = null;

    canvas.addEventListener("pointerdown", (event) => {
      if (!watermarkBounds) return;
      const pt = canvasPoint(canvas, event);
      if (!hitWatermark(pt.x, pt.y, watermarkBounds)) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag = {
        ox: pt.x - watermarkBounds.x,
        oy: pt.y - watermarkBounds.y,
        raf: 0,
      };
      canvas.classList.add("is-dragging-wm");
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!watermarkBounds) {
        canvas.classList.remove("is-over-wm");
        return;
      }
      const pt = canvasPoint(canvas, event);
      if (!drag) {
        canvas.classList.toggle("is-over-wm", hitWatermark(pt.x, pt.y, watermarkBounds));
        return;
      }
      const nextX = pt.x - drag.ox;
      const nextY = pt.y - drag.oy;
      customPos = {
        x: nextX / canvas.width,
        y: nextY / canvas.height,
      };
      if (!drag.raf) {
        drag.raf = requestAnimationFrame(() => {
          if (drag) drag.raf = 0;
          refreshCanvas(root).catch(() => {});
        });
      }
    });

    const endDrag = (event) => {
      if (!drag) return;
      if (drag.raf) cancelAnimationFrame(drag.raf);
      drag = null;
      canvas.classList.remove("is-dragging-wm");
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      syncCornerActive(root);
      refreshCanvas(root).catch(() => {});
      if (statusEl) statusEl.textContent = "Custom watermark placement saved.";
    };

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  }

  root.querySelector("#media-download")?.addEventListener("click", () => {
    const out = /** @type {HTMLCanvasElement | null} */ (root.querySelector("#media-compose-canvas"));
    const draft = getMediaDraft();
    if (!out || !draft) return;
    try {
      const format = getMediaFormat(formatId);
      const link = document.createElement("a");
      const safe = draft.sourceLabel.replace(/[^\w\-]+/g, "_").slice(0, 40) || "image";
      const sizeTag = format.width && format.height ? `-${format.width}x${format.height}` : "";
      link.download = `pitchiq-media-${safe}-${format.id}${sizeTag}.png`;
      link.href = out.toDataURL("image/png");
      link.click();
      if (statusEl) {
        statusEl.textContent = format.width
          ? `Downloaded ${format.label} (${format.width}×${format.height}).`
          : "Downloaded original size.";
      }
    } catch (error) {
      if (statusEl) statusEl.textContent = error?.message || "Download failed.";
    }
  });

  root.querySelector("#media-clear")?.addEventListener("click", () => {
    clearMediaDraft();
    customPos = null;
    sourceImage = null;
    sourceImageUrl = null;
    sourcePromise = null;
    watermarkBounds = null;
    paint(root);
  });
}

/**
 * @param {HTMLElement} root
 */
export function mountMediaCreatorPage(root) {
  paint(root);
}
