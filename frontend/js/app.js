/* ==========================================================================
   app.js — signed-in pages: auth guard, sidebar, top bar, notifications,
   and the ⌘K command palette. Load after core.js.
   ========================================================================== */

(() => {
  const token = Session.token();
  if (!token) endSession(false);
  else if (Session.isExpired(token)) endSession(true);
  else if (document.body.dataset.admin !== undefined && Session.user().role !== "admin") {
    window.location.href = "dashboard.html";
  }
})();

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD_KEY = isMac ? "⌘" : "Ctrl";

const NAV = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Overview", icon: "layout-dashboard", href: "dashboard.html" },
      { id: "history", label: "My reports", icon: "list-checks", href: "history.html", badge: "matches" },
      { id: "browse", label: "Browse found items", icon: "scan-search", href: "browse.html" }
    ]
  },
  {
    label: "Report",
    items: [
      { id: "lost", label: "I lost something", icon: "search-x", href: "lost.html" },
      { id: "found", label: "I found something", icon: "hand-heart", href: "found.html" }
    ]
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [{ id: "admin", label: "Admin console", icon: "shield-check", href: "admin.html", badge: "claims" }]
  },
  {
    label: "Account",
    items: [{ id: "profile", label: "Settings", icon: "settings", href: "profile.html" }]
  }
];

function themeIconName() {
  return Theme.resolved() === "dark" ? "moon" : "sun";
}

function buildShell() {
  const page = document.body.dataset.page;
  const user = Session.user();
  const isAdmin = user.role === "admin";
  const main = document.querySelector("main.page");
  const current = NAV.flatMap(s => s.items).find(item => item.id === page);

  const nav = NAV.filter(section => !section.adminOnly || isAdmin).map(section => `
    <div class="nav-section">
      <div class="nav-label">${section.label}</div>
      ${section.items.map(item => `
        <a class="nav-link ${item.id === page ? "active" : ""}" href="${item.href}" ${item.id === page ? 'aria-current="page"' : ""}>
          ${icon(item.icon)}<span>${item.label}</span>
          ${item.badge ? `<span class="nav-count" data-badge="${item.badge}" hidden></span>` : ""}
        </a>`).join("")}
    </div>`).join("");

  const shell = document.createElement("div");
  shell.className = "app-shell";
  shell.innerHTML = `
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <a href="dashboard.html" class="brand">
          <span class="brand-mark">${icon("package-search")}</span>
          <span class="brand-name">Lost &amp; Found</span>
        </a>
      </div>
      <button class="sidebar-search" data-cmdk>
        ${icon("search", "icon-sm")}<span>Search or jump to…</span><span class="kbd">${MOD_KEY} K</span>
      </button>
      <nav>${nav}</nav>
      <div class="sidebar-footer">
        <div class="sidebar-card">
          <strong>Found something?</strong>
          Report it here, then drop it at the admin office so the owner can collect it.
        </div>
        <div class="menu-anchor">
          <button class="user-button" data-menu="userMenu" aria-expanded="false">
            ${avatarHtml(user.name)}
            <span class="grow" style="min-width:0">
              <span class="user-name truncate" style="display:block">${escapeHtml(user.name)}</span>
              <span class="user-email truncate" style="display:block">${escapeHtml(user.email || user.role)}</span>
            </span>
            ${icon("chevrons-up-down", "icon-sm")}
          </button>
          <div class="menu menu-up" id="userMenu" role="menu">
            <div class="menu-label">Signed in as ${escapeHtml(user.role)}</div>
            <a class="menu-item" href="profile.html" role="menuitem">${icon("user")} Profile &amp; settings</a>
            <button class="menu-item" data-theme-toggle role="menuitem">${icon("sun-moon")} Toggle theme <span class="kbd">${MOD_KEY} J</span></button>
            <button class="menu-item" data-cmdk role="menuitem">${icon("command")} Command menu <span class="kbd">${MOD_KEY} K</span></button>
            <div class="menu-sep"></div>
            <button class="menu-item danger" data-logout role="menuitem">${icon("log-out")} Log out</button>
          </div>
        </div>
      </div>
    </aside>
    <div class="app-main">
      <header class="topbar">
        <button class="icon-btn mobile-only" id="menuBtn" aria-label="Open navigation">${icon("menu")}</button>
        <div class="topbar-title">${icon(current?.icon || "layout-dashboard")}<strong>${escapeHtml(document.body.dataset.title || current?.label || "")}</strong></div>
        <div class="topbar-actions">
          <button class="icon-btn mobile-only" data-cmdk aria-label="Search">${icon("search")}</button>
          <button class="icon-btn" data-theme-toggle aria-label="Toggle theme" id="themeBtn">${icon(themeIconName())}</button>
          <div class="menu-anchor">
            <button class="icon-btn" data-menu="notifPanel" aria-expanded="false" aria-label="Notifications" id="notifBtn">
              ${icon("bell")}<span class="dot-count" id="notifCount" hidden></span>
            </button>
            <div class="menu menu-right notif-panel" id="notifPanel">
              <div class="notif-head">
                <strong>Notifications</strong>
                <button class="btn btn-ghost btn-sm" id="markAllRead">${icon("check-check", "icon-sm")} Mark all read</button>
              </div>
              <div class="notif-list" id="notifList"></div>
            </div>
          </div>
          <div class="menu-anchor desktop-only">
            <button class="btn btn-primary btn-sm" data-menu="newMenu" aria-expanded="false">${icon("plus", "icon-sm")} New report</button>
            <div class="menu menu-right" id="newMenu" style="min-width:260px">
              <a class="menu-item" href="lost.html" style="height:auto;padding:10px">
                <span class="notif-icon tone-amber">${icon("search-x")}</span>
                <span><span style="display:block">I lost something</span><span class="menu-desc">We'll match it against found items</span></span>
              </a>
              <a class="menu-item" href="found.html" style="height:auto;padding:10px">
                <span class="notif-icon tone-green">${icon("hand-heart")}</span>
                <span><span style="display:block">I found something</span><span class="menu-desc">Help it get back to its owner</span></span>
              </a>
            </div>
          </div>
        </div>
      </header>
    </div>`;

  shell.querySelector(".app-main").appendChild(main);
  document.body.prepend(shell);

  const backdrop = document.createElement("div");
  backdrop.className = "sidebar-backdrop";
  document.body.appendChild(backdrop);

  const sidebar = shell.querySelector("#sidebar");
  const toggleSidebar = open => {
    sidebar.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
  };
  shell.querySelector("#menuBtn").addEventListener("click", () => toggleSidebar(true));
  backdrop.addEventListener("click", () => toggleSidebar(false));

  document.addEventListener("click", e => {
    const themeButton = e.target.closest("[data-theme-toggle]");
    if (themeButton) Theme.toggle(e);
    if (e.target.closest("[data-logout]")) logout();
    if (e.target.closest("[data-cmdk]")) CommandMenu.open();
  });

  document.addEventListener("themechange", () => {
    const btn = document.getElementById("themeBtn");
    if (btn) btn.innerHTML = icon(themeIconName());
  });

  hydrateIcons();
  requestAnimationFrame(() => document.body.classList.remove("app-booting"));
}

async function logout() {
  const ok = await confirmDialog({
    title: "Log out?",
    message: "You'll need to sign in again to see your reports.",
    confirmText: "Log out",
    iconName: "log-out"
  });
  if (ok) endSession(false);
}

// Sidebar badges: matches waiting on you, claims waiting on admins
async function refreshNavBadges() {
  const set = (key, count) => {
    const el = document.querySelector(`[data-badge="${key}"]`);
    if (!el) return;
    el.textContent = count;
    el.hidden = !count;
  };
  try {
    const lost = await apiFetch("/api/lost/my");
    set("matches", lost.filter(item => item.status === "matched").length);
  } catch { /* badge is optional */ }
  if (Session.user().role === "admin") {
    try {
      set("claims", (await apiFetch("/api/admin/stats")).claimed);
    } catch { /* ignore */ }
  }
}

// --- Notifications -------------------------------------------------------
function notificationTone(title) {
  const t = title.toLowerCase();
  if (t.includes("returned") || t.includes("thank")) return ["tone-green", "circle-check"];
  if (t.includes("match") && !t.includes("ruled")) return ["tone-blue", "sparkles"];
  if (t.includes("claim")) return ["tone-violet", "hand"];
  if (t.includes("ruled")) return ["tone-amber", "circle-x"];
  return ["", "bell"];
}

let notifications = [];

async function loadNotifications() {
  try {
    const data = await apiFetch("/api/notifications");
    notifications = data.notifications;

    const count = document.getElementById("notifCount");
    count.textContent = data.unread > 9 ? "9+" : data.unread;
    count.hidden = data.unread === 0;

    document.getElementById("notifList").innerHTML = notifications.length
      ? notifications.map(n => {
          const [tone, iconName] = notificationTone(n.title);
          return `
            <button class="notif-item ${n.read ? "" : "unread"}" data-id="${n._id}" data-link="${escapeHtml(n.link || "")}">
              <span class="notif-icon ${tone}">${icon(iconName)}</span>
              <span class="grow">
                <span class="notif-title" style="display:block">${escapeHtml(n.title)}</span>
                <span class="notif-message" style="display:block">${escapeHtml(n.message)}</span>
                <span class="notif-time" style="display:block">${timeAgo(n.createdAt)}</span>
              </span>
            </button>`;
        }).join("")
      : emptyHtml({ iconName: "bell-off", title: "You're all caught up", text: "We'll let you know when something matches." });

    document.dispatchEvent(new CustomEvent("notificationsloaded", { detail: notifications }));
  } catch (error) {
    console.error("Notifications:", error.message);
  }
}

async function markAllNotificationsRead() {
  await apiFetch("/api/notifications/read", { method: "PUT" }).catch(() => {});
  loadNotifications();
}

function initNotifications() {
  document.getElementById("markAllRead").addEventListener("click", markAllNotificationsRead);
  document.getElementById("notifList").addEventListener("click", async e => {
    const item = e.target.closest(".notif-item");
    if (!item) return;
    await apiFetch(`/api/notifications/${item.dataset.id}/read`, { method: "PUT" }).catch(() => {});
    const link = item.dataset.link;
    const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
    // Only follow links to our own pages
    if (/^[a-z]+\.html$/.test(link) && link !== currentPage) window.location.href = link;
    else loadNotifications();
  });
  loadNotifications();
  setInterval(loadNotifications, 60000);
}

// --- Command palette -----------------------------------------------------
const CommandMenu = (() => {
  let overlay, input, list;
  let results = [];
  let active = 0;
  let reports = null;

  const go = href => () => { window.location.href = href; };

  function baseCommands() {
    const isAdmin = Session.user().role === "admin";
    const pages = NAV.filter(s => !s.adminOnly || isAdmin).flatMap(s => s.items)
      .map(item => ({ group: "Pages", label: item.label, iconName: item.icon, run: go(item.href), keywords: item.id }));
    const actions = [
      { group: "Actions", label: "Report a lost item", iconName: "search-x", run: go("lost.html"), keywords: "new lost" },
      { group: "Actions", label: "Report a found item", iconName: "hand-heart", run: go("found.html"), keywords: "new found" },
      { group: "Actions", label: `Switch to ${Theme.resolved() === "dark" ? "light" : "dark"} mode`, iconName: "sun-moon", run: () => Theme.toggle(), keywords: "theme dark light appearance", hint: `${MOD_KEY} J` },
      { group: "Actions", label: "Mark all notifications read", iconName: "check-check", run: markAllNotificationsRead, keywords: "notifications" },
      { group: "Actions", label: "Log out", iconName: "log-out", run: logout, keywords: "sign out" }
    ];
    return [...pages, ...actions];
  }

  async function loadReports() {
    if (reports) return;
    reports = [];
    try {
      const [lost, found] = await Promise.all([apiFetch("/api/lost/my"), apiFetch("/api/found/my")]);
      reports = [
        ...lost.map(item => ({ group: "Your reports", label: item.itemName, hint: STATUS[item.status]?.[1], iconName: categoryMeta(item.category).icon, run: go("history.html?tab=lost"), keywords: `lost ${item.category} ${item.location}` })),
        ...found.map(item => ({ group: "Your reports", label: item.itemName || item.category, hint: "Found", iconName: categoryMeta(item.category).icon, run: go("history.html?tab=found"), keywords: `found ${item.category} ${item.location}` }))
      ];
      render();
    } catch { /* optional */ }
  }

  function filter(query) {
    const q = query.trim().toLowerCase();
    const all = [...baseCommands(), ...(reports || [])];
    if (!q) return all.filter(cmd => cmd.group !== "Your reports").concat((reports || []).slice(0, 5));
    return all.filter(cmd => `${cmd.label} ${cmd.keywords || ""}`.toLowerCase().includes(q));
  }

  function render() {
    if (!overlay) return;
    results = filter(input.value);
    active = Math.min(active, Math.max(results.length - 1, 0));
    let lastGroup = "";
    list.innerHTML = results.length
      ? results.map((cmd, i) => {
          const header = cmd.group !== lastGroup ? `<div class="cmdk-group">${cmd.group}</div>` : "";
          lastGroup = cmd.group;
          return `${header}<button class="cmdk-item ${i === active ? "active" : ""}" data-index="${i}" role="option" aria-selected="${i === active}">
            <span class="cmdk-item-icon">${icon(cmd.iconName, "icon-sm")}</span>
            <span class="truncate">${escapeHtml(cmd.label)}</span>
            ${cmd.hint ? `<span class="cmdk-hint">${escapeHtml(cmd.hint)}</span>` : ""}
          </button>`;
        }).join("")
      : `<div class="cmdk-empty">No results for “${escapeHtml(input.value)}”</div>`;
    list.querySelector(".cmdk-item.active")?.scrollIntoView({ block: "nearest" });
  }

  function run(index) {
    const cmd = results[index];
    if (!cmd) return;
    close();
    setTimeout(cmd.run, 120);
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "overlay cmdk-overlay";
    overlay.id = "commandMenu";
    overlay.innerHTML = `
      <div class="modal cmdk" role="dialog" aria-modal="true" aria-label="Command menu">
        <div class="cmdk-input-wrap">
          ${icon("search")}
          <input class="cmdk-input" placeholder="Search pages, actions, your reports…" aria-label="Search" autocomplete="off">
          <span class="kbd">esc</span>
        </div>
        <div class="cmdk-list" role="listbox"></div>
        <div class="cmdk-footer">
          <span><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span>
          <span><span class="kbd">↵</span> open</span>
          <span class="ml-auto">${icon("command", "icon-sm")} Lost &amp; Found</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    input = overlay.querySelector(".cmdk-input");
    list = overlay.querySelector(".cmdk-list");

    input.addEventListener("input", () => { active = 0; render(); });
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % Math.max(results.length, 1); render(); }
      if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + results.length) % Math.max(results.length, 1); render(); }
      if (e.key === "Enter") { e.preventDefault(); run(active); }
    });
    list.addEventListener("mousemove", e => {
      const item = e.target.closest(".cmdk-item");
      if (item && Number(item.dataset.index) !== active) { active = Number(item.dataset.index); render(); }
    });
    list.addEventListener("click", e => {
      const item = e.target.closest(".cmdk-item");
      if (item) run(Number(item.dataset.index));
    });
  }

  function open() {
    if (!overlay) build();
    closeMenus();
    input.value = "";
    active = 0;
    render();
    openModal(overlay);
    // Focus now, not after the animation, so fast typing isn't lost
    input.focus();
    loadReports();
  }

  function close() {
    closeModal(overlay);
  }

  document.addEventListener("keydown", e => {
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      overlay?.classList.contains("open") ? close() : open();
    }
    if (mod && e.key.toLowerCase() === "j") {
      e.preventDefault();
      Theme.toggle();
    }
  });

  return { open, close };
})();

buildShell();
initNotifications();
refreshNavBadges();
