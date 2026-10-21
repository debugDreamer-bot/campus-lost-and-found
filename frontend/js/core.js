/* ==========================================================================
   core.js — shared by every page: config, theme, icons, formatting,
   API client, toasts, modals, and small UI behaviours
   ========================================================================== */

// The API lives on the same site (localhost:5000 locally, /api on Netlify).
// Pages opened from dev-server.py or as files call the local backend instead.
const BASE_URL = location.protocol === "file:" ||
  (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port !== "5000")
  ? "http://localhost:5000"
  : location.origin;

const CATEGORIES = [
  { value: "Wallet", icon: "wallet" },
  { value: "Phone", icon: "smartphone" },
  { value: "Bag", icon: "backpack" },
  { value: "Laptop", icon: "laptop" },
  { value: "Keys", icon: "key-round" },
  { value: "ID Card", icon: "id-card" },
  { value: "Books", icon: "book-open" },
  { value: "Electronics", icon: "headphones" },
  { value: "Water bottle", icon: "milk" },
  { value: "Clothing", icon: "shirt" },
  { value: "USB Drive", icon: "usb" },
  { value: "Others", icon: "package" }
];

const CAMPUS_PLACES = [
  "Central Library", "Canteen", "Main auditorium", "Computer lab", "Seminar Hall", "Gym",
  "Parking lot", "Hostel gate", "Admin block", "Bus stop", "Sports ground", "Exam hall"
];

function categoryMeta(name) {
  const index = CATEGORIES.findIndex(c => c.value === name);
  const safeIndex = index >= 0 ? index : CATEGORIES.length - 1;
  return { icon: CATEGORIES[safeIndex].icon, tint: `cat-tint-${safeIndex % 6}` };
}

// --- Theme ---------------------------------------------------------------
const Theme = {
  get() {
    try { return localStorage.getItem("theme") || "system"; } catch { return "system"; }
  },
  resolved(mode = this.get()) {
    if (mode !== "system") return mode;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  },
  apply() {
    document.documentElement.dataset.theme = this.resolved();
    document.dispatchEvent(new CustomEvent("themechange"));
  },
  // Switches with a circular reveal from the click point where supported
  set(mode, event) {
    try { localStorage.setItem("theme", mode); } catch { /* private mode */ }
    if (this.resolved(mode) === document.documentElement.dataset.theme) return this.apply();

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduce) {
      document.body.classList.add("theme-switching");
      this.apply();
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("theme-switching")));
      return;
    }

    const x = event?.clientX ?? innerWidth - 60;
    const y = event?.clientY ?? 30;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(() => this.apply());
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(0.2, 0, 0, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  },
  toggle(event) {
    this.set(this.resolved() === "dark" ? "light" : "dark", event);
  }
};

Theme.apply();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (Theme.get() === "system") Theme.apply();
});

// --- Icons (Lucide subset in icons.js) -----------------------------------
const ARROW_SVG = `<svg class="btn-arrow" viewBox="0 0 16 16" aria-hidden="true"><path class="arrow-stem" d="M2.5 8h10.5"/><path class="arrow-head" d="M6.5 3.5 11 8l-4.5 4.5"/></svg>`;

function icon(name, cls = "") {
  if (name === "arrow-anim") return ARROW_SVG;
  const node = (window.ICONS || {})[name];
  if (!node) return "";
  const children = node.map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`
  ).join("");
  return `<svg class="icon ${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

// Replaces <i data-icon="…"> placeholders with SVGs (keeps their class)
function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach(el => {
    const tpl = document.createElement("template");
    tpl.innerHTML = icon(el.dataset.icon, el.className);
    if (tpl.content.firstElementChild) el.replaceWith(tpl.content.firstElementChild);
  });
}

// --- Formatting ----------------------------------------------------------
// Every value from the API goes through this before landing in innerHTML
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function formatDate(value, opts = {}) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", ...opts });
}

function timeAgo(value) {
  const minutes = Math.floor((Date.now() - new Date(value)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return days < 30 ? `${days}d ago` : formatDate(value, { year: "numeric" });
}

// "Today", "Yesterday", "3 days ago", then a date. Pass lower=true mid-sentence.
function relativeDay(value, lower = false) {
  if (!value) return "—";
  const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(new Date()) - start(new Date(value))) / 864e5);
  if (days <= 0) return lower ? "today" : "Today";
  if (days === 1) return lower ? "yesterday" : "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(value);
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function initials(name) {
  const parts = String(name || "?").replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_GRADIENTS = [
  ["#7c5cff", "#ec4899"], ["#06b6d4", "#3b82f6"], ["#f97316", "#ef4444"],
  ["#10b981", "#06b6d4"], ["#8b5cf6", "#3b82f6"], ["#f59e0b", "#f97316"]
];

function avatarHtml(name, cls = "") {
  const hash = [...String(name || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const [a, b] = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
  return `<span class="avatar ${cls}" style="--av-1:${a};--av-2:${b}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

function plural(count, word, many = `${word}s`) {
  return `${count} ${count === 1 ? word : many}`;
}

function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function imageUrl(filename) {
  return `${BASE_URL}/uploads/${encodeURIComponent(filename)}`;
}

// --- Session & API -------------------------------------------------------
const Session = {
  token() {
    try { return localStorage.getItem("token"); } catch { return null; }
  },
  user() {
    try {
      return {
        name: localStorage.getItem("name") || "User",
        email: localStorage.getItem("email") || "",
        role: localStorage.getItem("role") || "student"
      };
    } catch {
      return { name: "User", email: "", role: "student" };
    }
  },
  save(token, user) {
    localStorage.setItem("token", token);
    localStorage.setItem("name", user.name);
    localStorage.setItem("email", user.email || "");
    localStorage.setItem("role", user.role);
  },
  setName(name) {
    try { localStorage.setItem("name", name); } catch { /* ignore */ }
  },
  clear() {
    try { ["token", "role", "name", "email"].forEach(key => localStorage.removeItem(key)); } catch { /* ignore */ }
  },
  // The JWT payload's "exp" is in seconds
  isExpired(jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }
};

function endSession(expired) {
  Session.clear();
  window.location.href = expired ? "login.html?expired=1" : "login.html";
}

// fetch() for the API: adds the token, handles an expired session, and
// throws an Error carrying the server's message.
async function apiFetch(path, { method = "GET", body, json, auth = true } = {}) {
  const headers = {};
  const token = Session.token();
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  } catch {
    throw new Error("Can't reach the server. Check that the backend is running.");
  }

  if (res.status === 401 && auth && token) {
    endSession(true);
    throw new Error("Your session has expired. Please log in again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// --- Toasts --------------------------------------------------------------
const toast = (() => {
  let container;
  const ICON = { success: "circle-check", error: "circle-alert", info: "info" };

  function show(message, type = "success", { title, duration = 4200 } = {}) {
    if (!container) {
      container = document.createElement("div");
      container.className = "toaster";
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      ${icon(ICON[type] || "info", "toast-icon")}
      <div class="toast-body">
        ${title ? `<div class="toast-title">${escapeHtml(title)}</div><div class="muted">${escapeHtml(message)}</div>` : `<div class="toast-title">${escapeHtml(message)}</div>`}
      </div>
      <button class="toast-close" aria-label="Dismiss">${icon("x", "icon-sm")}</button>`;

    const dismiss = () => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 250);
    };
    el.querySelector(".toast-close").addEventListener("click", dismiss);
    container.appendChild(el);

    let timer = setTimeout(dismiss, duration);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", () => { timer = setTimeout(dismiss, 1500); });
  }

  return {
    show,
    success: (msg, opts) => show(msg, "success", opts),
    error: (msg, opts) => show(msg, "error", opts),
    info: (msg, opts) => show(msg, "info", opts)
  };
})();

// --- Modals --------------------------------------------------------------
const modalStack = [];

function openModal(id) {
  const overlay = typeof id === "string" ? document.getElementById(id) : id;
  if (!overlay || overlay.classList.contains("open")) return;
  overlay.classList.add("open");
  modalStack.push({ overlay, returnFocus: document.activeElement });
  document.body.style.overflow = "hidden";
  if (!overlay.contains(document.activeElement)) {
    const target = overlay.querySelector("[autofocus], input:not([type=hidden]):not([type=radio]), textarea, .modal button:not(.modal-close)");
    target?.focus({ preventScroll: true });
  }
}

function closeModal(id) {
  const overlay = typeof id === "string" ? document.getElementById(id) : id;
  if (!overlay || !overlay.classList.contains("open")) return;
  overlay.classList.remove("open");
  const index = modalStack.findIndex(entry => entry.overlay === overlay);
  const [entry] = index >= 0 ? modalStack.splice(index, 1) : [];
  if (!modalStack.length) document.body.style.overflow = "";
  entry?.returnFocus?.focus?.({ preventScroll: true });
  overlay.dispatchEvent(new CustomEvent("modalclose"));
}

// Builds a reusable modal. Elements with [data-close] close it.
function createModal({ id, size = "", title = "", desc = "", body = "", footer = "", iconHtml = "" }) {
  document.getElementById(id)?.remove();
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.id = id;
  overlay.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-header">
        ${iconHtml}
        <div class="grow">
          <h2 class="modal-title" id="${id}-title">${title}</h2>
          ${desc ? `<p class="modal-desc">${desc}</p>` : ""}
        </div>
        <button class="btn btn-ghost btn-icon btn-sm modal-close" data-close aria-label="Close">${icon("x")}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ""}
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function confirmDialog({ title, message, confirmText = "Confirm", cancelText = "Cancel", danger = false, iconName }) {
  return new Promise(resolve => {
    const overlay = createModal({
      id: "confirmDialog",
      title: escapeHtml(title),
      desc: escapeHtml(message),
      iconHtml: `<div class="modal-icon ${danger ? "modal-icon-danger" : "modal-icon-accent"}">${icon(iconName || (danger ? "triangle-alert" : "circle-help"))}</div>`,
      footer: `
        <button class="btn btn-secondary" data-close>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmText)}</button>`
    });
    overlay.querySelector(".modal-body").remove();
    overlay.querySelector(".modal-header").style.paddingBottom = "20px";

    let result = false;
    overlay.querySelector("[data-confirm]").addEventListener("click", () => {
      result = true;
      closeModal(overlay);
    });
    overlay.addEventListener("modalclose", () => {
      resolve(result);
      setTimeout(() => overlay.remove(), 250);
    });
    requestAnimationFrame(() => openModal(overlay));
  });
}

function showImage(url) {
  let viewer = document.getElementById("imageViewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.className = "overlay viewer";
    viewer.id = "imageViewer";
    viewer.innerHTML = `<img alt="Item photo">`;
    document.body.appendChild(viewer);
    viewer.addEventListener("click", () => closeModal(viewer));
  }
  viewer.querySelector("img").src = url;
  openModal(viewer);
}

document.addEventListener("click", e => {
  const preview = e.target.closest("[data-preview]");
  if (preview) {
    e.preventDefault();
    showImage(preview.dataset.preview);
    return;
  }
  if (e.target.closest("[data-close]")) {
    closeModal(e.target.closest(".overlay"));
    return;
  }
  // Clicking the dimmed backdrop closes the modal
  if (e.target.classList.contains("overlay") && !e.target.classList.contains("viewer")) closeModal(e.target);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const openMenu = document.querySelector(".menu.open");
  if (openMenu) {
    closeMenus();
    return;
  }
  // Only the topmost modal closes
  const top = modalStack[modalStack.length - 1];
  if (top) closeModal(top.overlay);
});

// --- Dropdown menus: <button data-menu="menuId"> + <div class="menu" id="menuId"> ---
function closeMenus(except) {
  document.querySelectorAll(".menu.open").forEach(menu => {
    if (menu === except) return;
    menu.classList.remove("open");
    document.querySelector(`[data-menu="${menu.id}"]`)?.setAttribute("aria-expanded", "false");
  });
}

document.addEventListener("click", e => {
  const trigger = e.target.closest("[data-menu]");
  if (trigger) {
    const menu = document.getElementById(trigger.dataset.menu);
    const willOpen = !menu.classList.contains("open");
    closeMenus(menu);
    menu.classList.toggle("open", willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) trigger.dispatchEvent(new CustomEvent("menuopen", { bubbles: true }));
    return;
  }
  if (!e.target.closest(".menu") || e.target.closest(".menu-item")) closeMenus();
});

// --- Buttons -------------------------------------------------------------
// Shows a spinner on the button while `task` runs
async function withLoading(button, task) {
  if (!button) return task();
  if (!button.querySelector(".btn-spinner")) {
    button.insertAdjacentHTML("beforeend", `<span class="btn-spinner" aria-hidden="true"></span>`);
  }
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  try {
    return await task();
  } finally {
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
  }
}

// --- Motion helpers ------------------------------------------------------
const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        entry.target.dispatchEvent(new CustomEvent("inview"));
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" })
  : null;

function observeReveals(root = document) {
  root.querySelectorAll("[data-reveal], [data-inview]").forEach(el => {
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add("in-view");
  });
}

function countUp(el, target, { duration = 1100, suffix = "", decimals = 0 } = {}) {
  if (!el) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const value = Number(target) || 0;
  const render = v => { el.textContent = v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }) + suffix; };
  if (reduce || value === 0) return render(value);

  const start = performance.now();
  const step = now => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    render(decimals ? eased * value : Math.round(eased * value));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Tabs with a sliding underline. `onChange(value)` fires on selection.
function initTabs(tablist, onChange) {
  let indicator = tablist.querySelector(".tab-indicator");
  if (!indicator) {
    indicator = document.createElement("span");
    indicator.className = "tab-indicator";
    tablist.appendChild(indicator);
  }

  const move = () => {
    const active = tablist.querySelector('[aria-selected="true"]');
    if (!active) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  };

  tablist.addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab || tab.getAttribute("aria-selected") === "true") return;
    tablist.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", String(t === tab)));
    move();
    onChange?.(tab.dataset.value);
  });

  window.addEventListener("resize", move);
  document.fonts?.ready.then(move);
  requestAnimationFrame(move);
  return { move };
}

// Segmented control with a sliding thumb
function initSegmented(el, onChange) {
  let thumb = el.querySelector(".seg-thumb");
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "seg-thumb";
    el.prepend(thumb);
  }
  const move = () => {
    const active = el.querySelector('[aria-pressed="true"]');
    if (!active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  };
  el.addEventListener("click", e => {
    const button = e.target.closest("button");
    if (!button) return;
    el.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
    move();
    onChange?.(button.dataset.value);
  });
  document.fonts?.ready.then(move);
  requestAnimationFrame(move);
  return { move };
}

// --- Item rendering ------------------------------------------------------
const STATUS = {
  pending: ["badge-amber", "Searching"],
  unmatched: ["badge-amber", "Waiting for owner"],
  matched: ["badge-blue", "Match found"],
  claimed: ["badge-violet", "Claim in review"],
  returned: ["badge-green", "Returned"]
};

// A found item with an owner's claim reads as "claimed"
function itemStage(item) {
  if (item.status === "matched" && item.claim?.submittedAt) return "claimed";
  return item.status;
}

function statusBadge(status) {
  const [cls, label] = STATUS[status] || ["", status];
  return `<span class="badge badge-dot ${cls}">${escapeHtml(label)}</span>`;
}

function thumbHtml(item, cls = "") {
  if (item?.image) {
    const url = escapeHtml(imageUrl(item.image));
    return `<div class="thumb ${cls}"><img src="${url}" alt="" loading="lazy" data-preview="${url}"></div>`;
  }
  const meta = categoryMeta(item?.category);
  return `<div class="thumb ${cls} ${meta.tint}" title="No photo">${icon(meta.icon)}</div>`;
}

const STEP_LABELS = ["Reported", "Matched", "Claimed", "Returned"];
// The step each stage is waiting on; "returned" means every step is done
const STAGE_STEP = { pending: 1, unmatched: 1, matched: 2, claimed: 3, returned: 4 };

function stepsHtml(stage, cls = "") {
  const current = STAGE_STEP[stage] ?? 1;
  const steps = STEP_LABELS.map((label, i) => {
    const state = i < current ? "is-done" : i === current ? "is-current" : "";
    const line = i < STEP_LABELS.length - 1 ? `<span class="step-line ${i + 1 < current ? "is-done" : ""}"></span>` : "";
    return `<span class="step ${state}"><span class="step-dot">${i < current ? icon("check") : ""}</span><span class="step-label">${label}</span></span>${line}`;
  });
  return `<div class="steps ${cls}" aria-label="Progress: ${escapeHtml(STATUS[stage]?.[1] || stage)}">${steps.join("")}</div>`;
}

function matchRingHtml(score, maxScore) {
  const percent = Math.max(0, Math.min(100, Math.round(((score || 0) / (maxScore || 125)) * 100)));
  return `<div class="match-ring" data-p="${percent}" style="--p:0"><div><span>${percent}%</span><small>match</small></div></div>`;
}

function animateRings(root = document) {
  root.querySelectorAll(".match-ring[data-p]").forEach(ring => {
    const target = Number(ring.dataset.p);
    const start = performance.now();
    const step = now => {
      const t = Math.min((now - start) / 900, 1);
      ring.style.setProperty("--p", (1 - Math.pow(1 - t, 3)) * target);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// One side of a lost/found comparison. `extra` adds [label, html] rows.
function compareCardHtml(label, item, kind, extra = []) {
  const meta = categoryMeta(item.category);
  const media = item.image
    ? `<img src="${escapeHtml(imageUrl(item.image))}" alt="" data-preview="${escapeHtml(imageUrl(item.image))}">`
    : icon(meta.icon);
  const keywords = (item.keywords || []).length
    ? `<div class="row wrap" style="gap:4px">${item.keywords.map(k => `<span class="tag tag-static">${escapeHtml(k)}</span>`).join("")}</div>`
    : `<span class="subtle">—</span>`;
  const rows = [
    ["Category", escapeHtml(item.category)],
    ["Location", escapeHtml(item.location || "—")],
    [kind === "lost" ? "Date lost" : "Date found", formatDate(kind === "lost" ? item.dateLost : item.dateFound, { year: "numeric" })],
    ["Keywords", keywords],
    ...(item.description !== undefined ? [["Description", escapeHtml(item.description || "—")]] : []),
    ...extra
  ];

  return `
    <div class="compare-card">
      <div class="compare-head"><span>${escapeHtml(label)}</span>${statusBadge(itemStage(item))}</div>
      <div class="compare-media ${item.image ? "" : meta.tint}">${media}</div>
      <div class="compare-body">
        <div class="compare-name">${escapeHtml(item.itemName || item.category)}</div>
        <dl class="detail-list">${rows.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join("")}</dl>
      </div>
    </div>`;
}

// Card for an unclaimed found item (browse page, dashboard)
function foundCardHtml(item, i = 0) {
  const meta = categoryMeta(item.category);
  const media = item.image
    ? `<img src="${escapeHtml(imageUrl(item.image))}" alt="" loading="lazy" data-preview="${escapeHtml(imageUrl(item.image))}">`
    : icon(meta.icon);
  return `
    <article class="card card-interactive item-card" style="--i:${i}" data-id="${item._id}">
      <div class="item-media ${item.image ? "" : meta.tint}">
        ${media}
        <span class="badge">${icon(meta.icon, "icon-sm")} ${escapeHtml(item.category)}</span>
      </div>
      <div class="item-body">
        <div class="item-title">${escapeHtml(item.itemName || item.category)}</div>
        <div class="item-meta">
          <span>${icon("map-pin")} ${escapeHtml(item.location || "Somewhere on campus")}</span>
          <span>${icon("calendar")} Found ${relativeDay(item.dateFound || item.createdAt, true)}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm btn-block" data-claim="${item._id}">${icon("hand", "icon-sm")} This is mine</button>
        </div>
      </div>
    </article>`;
}

function emptyHtml({ iconName = "inbox", title, text, action = "" }) {
  return `
    <div class="empty">
      <div class="empty-icon">${icon(iconName, "icon-lg")}</div>
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
      ${action}
    </div>`;
}

function skeletonRows(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="report-row">
      <div class="skeleton" style="width:48px;height:48px;border-radius:10px"></div>
      <div class="stack" style="gap:8px"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text" style="width:60%"></div></div>
      <div class="skeleton" style="width:90px;height:22px;border-radius:999px"></div>
    </div>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  hydrateIcons();
  observeReveals();
});
