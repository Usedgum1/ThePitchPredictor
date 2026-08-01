/** @type {{ id: string, label: string, items: { id: string, label: string, icon: string }[] }[]} */
export const NAV_SECTIONS = [
  {
    id: "analytics",
    label: "Game Analytics",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "◆" },
      { id: "draftkings", label: "DraftKings", icon: "▣" },
      { id: "fanduel", label: "FanDuel", icon: "▤" },
      { id: "models", label: "Models", icon: "◇" },
      { id: "pitchers", label: "Pitchers", icon: "◎" },
      { id: "games", label: "Games", icon: "▦" },
      { id: "umps", label: "Umps", icon: "◈" },
      { id: "team", label: "Team", icon: "⬡" },
    ],
  },
  {
    id: "site",
    label: "Site Utility",
    items: [
      { id: "customers", label: "Customers", icon: "◉" },
      { id: "admin", label: "Admin", icon: "⚙" },
      { id: "email", label: "Email", icon: "✉" },
      { id: "site-alert", label: "Site Alert", icon: "⚠" },
      { id: "media", label: "Media Creator", icon: "⧉" },
    ],
  },
];

/** Flat list for lookups (title, allowed ids). */
export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

/** @param {string} id */
export function navTitle(id) {
  return NAV_ITEMS.find((n) => n.id === id)?.label || "Dashboard";
}

/**
 * @param {HTMLElement} container
 * @param {string} activeId
 * @param {(id: string) => void} onSelect
 */
export function renderNav(container, activeId, onSelect) {
  container.innerHTML = "";

  for (const section of NAV_SECTIONS) {
    const group = document.createElement("div");
    group.className = "nav-section";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", section.label);

    const heading = document.createElement("p");
    heading.className = "nav-heading";
    heading.textContent = section.label;
    group.appendChild(heading);

    for (const item of section.items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `nav-btn${item.id === activeId ? " active" : ""}`;
      btn.innerHTML = `<span class="nav-icon" aria-hidden="true">${item.icon}</span><span class="nav-label">${item.label}</span>`;
      btn.addEventListener("click", () => onSelect(item.id));
      group.appendChild(btn);
    }

    container.appendChild(group);
  }
}
