import { navTitle } from "./nav.js";

/**
 * Phone-shell drawer controls for owners/mobile.html (body[data-shell="mobile"]).
 * No-ops on the desktop index shell.
 */

function isMobileShell() {
  return document.body?.dataset?.shell === "mobile";
}

/**
 * @returns {{ setOpen: (open: boolean) => void, syncViewTitle: (viewId: string) => void } | null}
 */
export function initMobileShell() {
  if (!isMobileShell()) return null;

  const menuBtn = document.getElementById("mobile-menu-btn");
  const closeBtn = document.getElementById("mobile-drawer-close");
  const backdrop = document.getElementById("mobile-drawer-backdrop");
  const drawer = document.getElementById("app-sidebar");
  const viewTitle = document.getElementById("mobile-view-title");

  /**
   * @param {boolean} open
   */
  function setOpen(open) {
    document.body.classList.toggle("drawer-open", open);
    menuBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    menuBtn?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    drawer?.setAttribute("aria-hidden", open ? "false" : "true");
    if (backdrop) {
      backdrop.hidden = !open;
      backdrop.classList.toggle("hidden", !open);
    }
    document.body.style.overflow = open ? "hidden" : "";
  }

  /**
   * @param {string} viewId
   */
  function syncViewTitle(viewId) {
    if (viewTitle) viewTitle.textContent = navTitle(viewId);
  }

  menuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!document.body.classList.contains("drawer-open"));
  });

  closeBtn?.addEventListener("click", () => setOpen(false));
  backdrop?.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  // Close after choosing a nav item (capture so it runs with the click).
  drawer?.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (target?.closest?.(".nav-btn")) setOpen(false);
  });

  setOpen(false);
  syncViewTitle("dashboard");

  return { setOpen, syncViewTitle };
}

export { isMobileShell };
