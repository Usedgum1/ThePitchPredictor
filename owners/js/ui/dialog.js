/**
 * Themed modal dialogs for PitchIQ Owners Portal.
 */

/** @type {HTMLElement | null} */
let root = null;
/** @type {((value: boolean) => void) | null} */
let pendingResolve = null;

function ensureDialog() {
  if (root) return root;
  root = document.createElement("div");
  root.id = "app-dialog";
  root.className = "app-dialog hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-dismiss="true"></div>
    <div class="app-dialog-card">
      <div class="app-dialog-brand">
        <img class="app-dialog-logo" src="images/PitchIQ%20Logo.png" width="28" height="28" alt="" />
        <span class="app-dialog-brand-name">PitchIQ Owners Portal</span>
      </div>
      <h2 class="app-dialog-title" id="app-dialog-title"></h2>
      <p class="app-dialog-message" id="app-dialog-message"></p>
      <div class="app-dialog-actions">
        <button type="button" class="btn btn-ghost" id="app-dialog-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="app-dialog-ok">Continue</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  root.querySelector("#app-dialog-ok")?.addEventListener("click", () => closeDialog(true));
  root.querySelector("#app-dialog-cancel")?.addEventListener("click", () => closeDialog(false));
  root.querySelector(".app-dialog-backdrop")?.addEventListener("click", () => {
    closeDialog(root?.dataset.mode === "confirm" ? false : true);
  });
  return root;
}

/** @param {boolean} result */
function closeDialog(result) {
  if (!root || root.classList.contains("hidden")) return;
  root.classList.add("hidden");
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve?.(result);
}

/**
 * @param {string} message
 * @param {{ title?: string, okLabel?: string }} [opts]
 */
export function alertDialog(message, opts = {}) {
  const el = ensureDialog();
  if (pendingResolve) closeDialog(false);
  el.dataset.mode = "alert";
  el.querySelector("#app-dialog-title").textContent = opts.title ?? "Notice";
  el.querySelector("#app-dialog-message").textContent = message;
  el.querySelector("#app-dialog-ok").textContent = opts.okLabel ?? "OK";
  el.querySelector("#app-dialog-cancel")?.classList.add("hidden");
  el.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingResolve = () => resolve();
  });
}

/**
 * @param {string} message
 * @param {{ title?: string, okLabel?: string, cancelLabel?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmDialog(message, opts = {}) {
  const el = ensureDialog();
  if (pendingResolve) closeDialog(false);
  el.dataset.mode = "confirm";
  el.querySelector("#app-dialog-title").textContent = opts.title ?? "Confirm";
  el.querySelector("#app-dialog-message").textContent = message;
  el.querySelector("#app-dialog-ok").textContent = opts.okLabel ?? "Continue";
  const cancel = el.querySelector("#app-dialog-cancel");
  if (cancel) {
    cancel.classList.remove("hidden");
    cancel.textContent = opts.cancelLabel ?? "Cancel";
  }
  el.classList.remove("hidden");
  return new Promise((resolve) => {
    pendingResolve = (result) => resolve(Boolean(result));
  });
}
