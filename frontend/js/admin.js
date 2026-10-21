/* Admin console: overview analytics, match review, all reports, CSV export */

const admin = {
  tab: ["overview", "matches", "reports"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview",
  stats: null,
  analytics: null,
  matches: [],
  maxScore: 125,
  browser: { type: "lost", status: "", category: "", q: "", page: 1 }
};

// Only the latest request may render, so a slow older response can't
// overwrite newer results
const latest = { matches: 0, items: 0 };

const STATUS_OPTIONS = {
  lost: [["", "All statuses"], ["pending", "Searching"], ["matched", "Match found"], ["claimed", "Claim in review"], ["returned", "Returned"]],
  found: [["", "All statuses"], ["unmatched", "Waiting for owner"], ["matched", "Matched"], ["returned", "Returned"]]
};

// --- Tabs ---
const adminTabs = initTabs(document.getElementById("adminTabs"), showTab);

function showTab(tab) {
  admin.tab = tab;
  history.replaceState(null, "", `#${tab}`);
  document.querySelectorAll("#adminTabs .tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.value === tab)));
  adminTabs.move();
  ["overview", "matches", "reports"].forEach(name => {
    document.getElementById(`panel-${name}`).hidden = name !== tab;
  });
  if (tab === "overview" && admin.analytics) renderDaysChart(admin.analytics.days);
}

// --- Overview ---
function kpi({ label, iconName, value, suffix = "", sub = "", highlight = false, action = "" }) {
  return `
    <div class="card stat ${highlight ? "is-highlight" : ""} ${action ? "card-interactive" : ""}">
      ${action ? `<button class="stat-link" data-goto="${action}" aria-label="${escapeHtml(label)}"></button>` : ""}
      <div class="stat-label">${icon(iconName)} ${escapeHtml(label)}</div>
      <div class="stat-value"><span data-count="${value}">0</span>${suffix ? `<small>${suffix}</small>` : ""}</div>
      ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ""}
    </div>`;
}

function formatDuration(hours) {
  if (hours === null || hours === undefined) return "No returns yet";
  if (hours < 24) return `Avg ${Math.max(1, hours)}h to return`;
  return `Avg ${(hours / 24).toFixed(1)} days to return`;
}

function renderKpis() {
  const s = admin.stats;
  const a = admin.analytics;
  const box = document.getElementById("kpis");
  box.innerHTML = [
    kpi({ label: "Claims to review", iconName: "hand", value: s.claimed, sub: s.claimed ? "Owners waiting on you" : "All caught up", highlight: s.claimed > 0, action: "matches" }),
    kpi({ label: "Waiting on owner", iconName: "clock", value: s.awaitingClaim, sub: "Matched, not yet claimed", action: "matches" }),
    kpi({ label: "Lost, still searching", iconName: "search-x", value: s.pendingLost, sub: "No match yet" }),
    kpi({ label: "Found, no owner yet", iconName: "inbox", value: s.unmatchedFound, sub: "Try “Find owner”" }),
    kpi({ label: "Returned", iconName: "package-check", value: s.returned, sub: formatDuration(a.avgHoursToReturn) }),
    kpi({ label: "Return rate", iconName: "trending-up", value: a.returnRate, suffix: "%", sub: "Of all lost reports" })
  ].join("");
  box.querySelectorAll("[data-count]").forEach(el => countUp(el, Number(el.dataset.count), { duration: 800 }));
}

// Round axis steps: 1, 2, 5, 10, 20…
function niceStep(max) {
  if (max <= 5) return 1;
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const n = raw / magnitude;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * magnitude;
}

const tooltip = document.getElementById("chartTooltip");

// Tooltip content is built with textContent: category names come from users
function showTooltip(target, title, rows) {
  tooltip.replaceChildren();
  const head = document.createElement("div");
  head.className = "tt-title";
  head.textContent = title;
  tooltip.appendChild(head);
  rows.forEach(([label, value, color]) => {
    const row = document.createElement("div");
    row.className = "tt-row";
    const key = document.createElement("i");
    key.style.background = color;
    const strong = document.createElement("b");
    strong.textContent = value;
    const name = document.createElement("span");
    name.textContent = label;
    row.append(key, strong, name);
    tooltip.appendChild(row);
  });

  const rect = target.getBoundingClientRect();
  tooltip.classList.add("show");
  const tipRect = tooltip.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, innerWidth - tipRect.width - 8));
  let top = rect.top - tipRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTooltip() {
  tooltip.classList.remove("show");
}

function dayLabel(dateKey, opts = { day: "numeric", month: "short" }) {
  return new Date(`${dateKey}T12:00`).toLocaleDateString(undefined, opts);
}

function renderDaysChart(days) {
  const box = document.getElementById("daysChart");
  const width = box.clientWidth;
  if (!width) return;
  const height = 230;
  const pad = { top: 10, right: 4, bottom: 26, left: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxValue = Math.max(1, ...days.flatMap(d => [d.lost, d.found]));
  const step = niceStep(maxValue);
  const yMax = Math.ceil(maxValue / step) * step;
  const y = v => pad.top + plotH - (v / yMax) * plotH;
  const band = plotW / days.length;
  const barW = Math.max(3, Math.min(12, (band - 10) / 2));
  const gap = 2;
  const labelEvery = width < 520 ? 3 : 2;

  const bar = (x, value, color, i) => {
    if (!value) return "";
    const top = y(value);
    const base = y(0);
    const r = Math.min(4, base - top, barW / 2);
    return `<path class="bar" style="fill:${color};--i:${i}" d="M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${base}Z"/>`;
  };

  let grid = "";
  for (let v = 0; v <= yMax; v += step) {
    grid += `<line class="${v === 0 ? "baseline" : "grid"}" x1="${pad.left}" x2="${width - pad.right}" y1="${y(v)}" y2="${y(v)}"/>
             <text class="axis-label" x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }

  let bands = "";
  let bars = "";
  let labels = "";
  days.forEach((d, i) => {
    const x0 = pad.left + band * i;
    const cx = x0 + band / 2;
    bands += `<rect class="band" x="${x0}" y="${pad.top}" width="${band}" height="${plotH}" rx="6" data-i="${i}" tabindex="0"
               aria-label="${dayLabel(d.date)}: ${d.lost} lost, ${d.found} found"></rect>`;
    bars += bar(cx - gap / 2 - barW, d.lost, "var(--series-1)", i) + bar(cx + gap / 2, d.found, "var(--series-2)", i);
    if (i % labelEvery === (days.length - 1) % labelEvery) {
      labels += `<text class="axis-label" x="${cx}" y="${height - 6}" text-anchor="middle">${dayLabel(d.date)}</text>`;
    }
  });

  box.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lost and found reports per day for the last 14 days">${grid}${bands}${bars}${labels}</svg>`;

  box.querySelectorAll(".band").forEach(rect => {
    const d = days[Number(rect.dataset.i)];
    const show = () => showTooltip(rect, dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" }), [
      ["Lost", d.lost, "var(--series-1)"],
      ["Found", d.found, "var(--series-2)"]
    ]);
    rect.addEventListener("pointerenter", show);
    rect.addEventListener("focus", show);
    rect.addEventListener("pointerleave", hideTooltip);
    rect.addEventListener("blur", hideTooltip);
  });

  document.getElementById("daysTable").innerHTML = `
    <table class="table">
      <thead><tr><th>Day</th><th class="num">Lost</th><th class="num">Found</th></tr></thead>
      <tbody>${days.map(d => `<tr><td>${dayLabel(d.date, { weekday: "short", day: "numeric", month: "short" })}</td><td class="num">${d.lost}</td><td class="num">${d.found}</td></tr>`).join("")}</tbody>
    </table>`;
}

function renderCategoryChart(categories) {
  const box = document.getElementById("categoryChart");
  if (!categories.length) {
    box.innerHTML = `<p class="muted text-sm">No reports yet.</p>`;
    return;
  }
  // Keep the chart readable: top 6, the rest folded into "Other"
  const top = categories.slice(0, 6);
  const rest = categories.slice(6);
  if (rest.length) {
    top.push(rest.reduce((acc, c) => ({ category: "Other", lost: acc.lost + c.lost, found: acc.found + c.found }), { category: "Other", lost: 0, found: 0 }));
  }
  const max = Math.max(1, ...top.flatMap(c => [c.lost, c.found]));

  box.innerHTML = top.map((c, i) => `
    <div class="hbar-row" data-i="${i}" tabindex="0">
      <span class="hbar-label truncate">${escapeHtml(c.category)}</span>
      <div class="hbar-bars">
        <div class="hbar"><i style="width:0;background:var(--series-1)" data-w="${(c.lost / max) * 100}"></i><b>${c.lost}</b></div>
        <div class="hbar"><i style="width:0;background:var(--series-2)" data-w="${(c.found / max) * 100}"></i><b>${c.found}</b></div>
      </div>
    </div>`).join("");

  requestAnimationFrame(() => box.querySelectorAll("[data-w]").forEach(bar => { bar.style.width = `calc(${bar.dataset.w}% - 28px)`; }));
  box.querySelectorAll(".hbar-row").forEach(row => {
    const c = top[Number(row.dataset.i)];
    const show = () => showTooltip(row.querySelector(".hbar-bars"), c.category, [["Lost", c.lost, "var(--series-1)"], ["Found", c.found, "var(--series-2)"]]);
    row.addEventListener("pointerenter", show);
    row.addEventListener("focus", show);
    row.addEventListener("pointerleave", hideTooltip);
    row.addEventListener("blur", hideTooltip);
  });
}

function renderLocations(locations) {
  const box = document.getElementById("locations");
  if (!locations.length) {
    box.innerHTML = `<p class="muted text-sm">No locations yet.</p>`;
    return;
  }
  const max = Math.max(...locations.map(l => l.count));
  box.innerHTML = `<div class="stack" style="gap:14px">${locations.map(l => `
    <div>
      <div class="row-between text-sm"><span class="inline-icon" style="color:var(--text)">${icon("map-pin", "icon-sm")}<span class="truncate">${escapeHtml(l.location)}</span></span><span class="muted">${plural(l.count, "report")}</span></div>
      <div class="meter mt-2"><i style="width:0" data-w="${(l.count / max) * 100}"></i></div>
    </div>`).join("")}</div>`;
  requestAnimationFrame(() => box.querySelectorAll("[data-w]").forEach(bar => { bar.style.width = `${bar.dataset.w}%`; }));
}

function renderLeaders(helpers) {
  const box = document.getElementById("leaders");
  box.innerHTML = helpers.length
    ? helpers.map((h, i) => `
        <div class="leader">
          <span class="leader-rank ${i === 0 ? "top" : ""}">${i === 0 ? icon("crown", "icon-sm") : i + 1}</span>
          ${avatarHtml(h.name, "avatar-sm")}
          <span class="leader-name">${escapeHtml(h.name)}</span>
          <span class="leader-score">${plural(h.returned, "item")}</span>
        </div>`).join("")
    : `<p class="muted text-sm" style="padding:12px 0">No returns yet.</p>`;
}

function renderAttention() {
  const box = document.getElementById("attentionList");
  const claimed = admin.matches.filter(m => m.claim?.submittedAt).slice(0, 4);
  if (!claimed.length) {
    box.innerHTML = emptyHtml({ iconName: "circle-check", title: "All caught up", text: "New claims will show up here." });
    return;
  }
  box.innerHTML = `<div class="report-list">${claimed.map((m, i) => `
    <div class="report-row" style="--i:${i};padding:12px 16px;grid-template-columns:auto minmax(0,1fr) auto">
      ${thumbHtml(m.matchedWith || m, "thumb-sm")}
      <div style="min-width:0">
        <div class="cell-title truncate">${escapeHtml(m.matchedWith?.itemName || m.itemName)}</div>
        <div class="cell-sub truncate">${escapeHtml(m.matchedWith?.user?.name || "Unknown")} · ${timeAgo(m.claim.submittedAt)}</div>
      </div>
      <button class="btn btn-secondary btn-sm" data-review="${m._id}">Review</button>
    </div>`).join("")}</div>`;
}

// --- Matches ---
function matchRow(found, i) {
  const lost = found.matchedWith || {};
  const owner = lost.user || {};
  const claimed = Boolean(found.claim?.submittedAt);
  const percent = Math.round(((found.matchScore || 0) / admin.maxScore) * 100);
  return `
    <div class="report-row" style="--i:${i}">
      <div class="row" style="gap:0">
        ${thumbHtml(lost)}
        <div style="margin-left:-12px;box-shadow:0 0 0 3px var(--surface);border-radius:10px">${thumbHtml(found)}</div>
      </div>
      <div style="min-width:0">
        <div class="report-name truncate">${escapeHtml(lost.itemName || "—")} <span class="subtle" style="font-weight:400">↔</span> ${escapeHtml(found.itemName || found.category)}</div>
        <div class="report-meta">
          <span>${icon("user")} ${escapeHtml(owner.name || "Unknown")}</span>
          <span>${icon("map-pin")} ${escapeHtml(found.location || "—")}</span>
          <span>${icon(categoryMeta(found.category).icon)} ${escapeHtml(found.category)}</span>
        </div>
      </div>
      <div class="report-side">
        <span class="badge ${percent >= 70 ? "badge-green" : percent >= 48 ? "badge-blue" : "badge-amber"}">${percent}% match</span>
        ${claimed ? `<span class="badge badge-dot badge-violet">Claimed ${timeAgo(found.claim.submittedAt)}</span>` : `<span class="badge badge-dot badge-amber">Awaiting owner</span>`}
        <button class="btn ${claimed ? "btn-primary" : "btn-secondary"} btn-sm" data-review="${found._id}">Review</button>
      </div>
    </div>`;
}

async function loadMatches() {
  const q = document.getElementById("matchSearch").value.trim();
  const requestId = ++latest.matches;
  const data = await apiFetch(`/api/admin/matches?q=${encodeURIComponent(q)}`);
  if (requestId !== latest.matches) return;
  admin.maxScore = data.maxScore;
  if (!q) admin.matches = data.matches;

  document.getElementById("matchCount").textContent = admin.matches.length;
  const list = document.getElementById("matchList");
  list.innerHTML = data.matches.length
    ? data.matches.map(matchRow).join("")
    : emptyHtml({ iconName: q ? "search" : "git-compare-arrows", title: q ? "No matches for that search" : "No open matches", text: q ? "Try an owner's name, an item or a place." : "When reports match, they'll appear here for review." });
  renderAttention();
}

function openReview(foundId) {
  const found = admin.matches.find(m => m._id === foundId);
  if (!found) return toast.error("This match is no longer open.");
  const lost = found.matchedWith || {};
  const person = u => `${escapeHtml(u?.name || "Unknown")}<div class="cell-sub">${escapeHtml(u?.email || "")}</div>`;

  const claimHtml = found.claim?.proof
    ? `<div class="proof"><div class="proof-label">Owner's proof · ${timeAgo(found.claim.submittedAt)}</div><p>${escapeHtml(found.claim.proof)}</p></div>`
    : `<div class="notice notice-info">${icon("clock")}<span>The owner hasn't claimed this yet. You can still approve it if they came to the office in person.</span></div>`;

  const overlay = createModal({
    id: "reviewModal",
    size: "modal-lg",
    title: "Review match",
    desc: "Check that both reports describe the same item, and that the proof fits.",
    body: `
      <div class="compare">
        ${compareCardHtml("Lost report", lost, "lost", [["Owner", person(lost.user)]])}
        <div class="compare-link"><span class="line"></span>${matchRingHtml(found.matchScore, admin.maxScore)}<span class="line"></span></div>
        ${compareCardHtml("Found report", found, "found", [["Found by", person(found.user)]])}
      </div>
      <div class="mt-4">${claimHtml}</div>`,
    footer: `
      <button class="btn btn-ghost btn-danger-ghost" data-reject-match="${found._id}">${icon("x", "icon-sm")} Not a match</button>
      <button class="btn btn-primary" data-approve="${found._id}">${icon("check", "icon-sm")} Approve &amp; mark returned</button>`
  });
  openModal(overlay);
  animateRings(overlay);
}

async function approve(foundId, button) {
  const ok = await confirmDialog({
    title: "Approve this return?",
    message: "Both reports are marked returned, and the owner and finder are notified.",
    confirmText: "Approve return",
    iconName: "package-check"
  });
  if (!ok) return;
  try {
    const data = await withLoading(button, () => apiFetch(`/api/admin/approve/${foundId}`, { method: "PUT" }));
    closeModal("reviewModal");
    toast.success(data.message, { title: "Marked as returned" });
    refreshAll();
  } catch (error) {
    toast.error(error.message);
  }
}

async function rejectMatch(foundId) {
  const ok = await confirmDialog({
    title: "Reject this match?",
    message: "Both items go back to searching, and this pair won't be suggested again.",
    confirmText: "Reject match",
    danger: true
  });
  if (!ok) return;
  try {
    const data = await apiFetch(`/api/admin/reject/${foundId}`, { method: "PUT" });
    closeModal("reviewModal");
    toast.info(data.message);
    refreshAll();
  } catch (error) {
    toast.error(error.message);
  }
}

// --- All reports ---
function renderStatusFilter() {
  document.getElementById("statusFilter").innerHTML = STATUS_OPTIONS[admin.browser.type]
    .map(([value, label]) => `<option value="${value}" ${admin.browser.status === value ? "selected" : ""}>${label}</option>`).join("");
}

function itemRow(item) {
  const isFound = admin.browser.type === "found";
  const reporter = item.user || {};
  const stage = itemStage(item);

  // Open match for this row, if any (lost rows look up their found side)
  const openMatch = isFound
    ? admin.matches.find(m => m._id === item._id)
    : admin.matches.find(m => m.matchedWith?._id === item._id);

  let action = "";
  if (isFound && item.status === "unmatched") {
    action = `<button class="btn btn-secondary btn-sm" data-candidates="${item._id}">${icon("link", "icon-sm")} Find owner</button>`;
  } else if (openMatch) {
    action = `<button class="btn btn-secondary btn-sm" data-review="${openMatch._id}">Review</button>`;
  }

  return `
    <tr>
      <td><div class="cell-main">${thumbHtml(item, "thumb-sm")}<span class="cell-title">${escapeHtml(item.itemName || "—")}</span></div></td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.location || "—")}</td>
      <td class="nowrap">${formatDate(isFound ? item.dateFound : item.dateLost)}</td>
      <td><div class="cell-main">${avatarHtml(reporter.name || "?", "avatar-sm")}<div><div class="cell-title">${escapeHtml(reporter.name || "Unknown")}</div><div class="cell-sub">${escapeHtml(reporter.email || "")}</div></div></div></td>
      <td>${statusBadge(stage)}</td>
      <td style="text-align:right">${action}</td>
    </tr>`;
}

async function loadItems() {
  const b = admin.browser;
  const params = new URLSearchParams({ type: b.type, page: b.page, limit: 8 });
  ["status", "category", "q"].forEach(key => { if (b[key]) params.set(key, b[key]); });

  const body = document.getElementById("itemsBody");
  body.style.opacity = "0.55";
  const requestId = ++latest.items;
  try {
    const data = await apiFetch(`/api/admin/items?${params}`);
    if (requestId !== latest.items) return;
    body.innerHTML = data.items.length
      ? data.items.map(itemRow).join("")
      : `<tr><td colspan="7">${emptyHtml({ iconName: "search", title: "No reports match these filters" })}</td></tr>`;
    document.getElementById("pagination").innerHTML = `
      <span>${plural(data.total, "report")} · page ${data.page} of ${data.pages}</span>
      <div class="row">
        <button class="btn btn-secondary btn-sm" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>${icon("chevron-left", "icon-sm")} Prev</button>
        <button class="btn btn-secondary btn-sm" data-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next ${icon("chevron-right", "icon-sm")}</button>
      </div>`;
  } catch (error) {
    body.innerHTML = `<tr><td colspan="7">${emptyHtml({ iconName: "wifi-off", title: "Couldn't load reports", text: error.message })}</td></tr>`;
  } finally {
    body.style.opacity = "";
  }
}

// --- Manual matching ---
async function openCandidates(foundId) {
  const overlay = createModal({
    id: "candidatesModal",
    size: "modal-md",
    title: "Find the owner",
    desc: "Lost reports still searching, best fit first. Linking notifies the owner.",
    body: skeletonRows(3)
  });
  openModal(overlay);

  try {
    const { found, candidates, maxScore } = await apiFetch(`/api/admin/found/${foundId}/candidates`);
    overlay.querySelector(".modal-body").innerHTML = `
      <div class="row" style="gap:14px;padding:12px;border-radius:12px;background:var(--surface-sunken);box-shadow:0 0 0 1px var(--border)">
        ${thumbHtml(found, "thumb-lg")}
        <div><span class="badge badge-outline mb-2">Found item</span><div class="cell-title">${escapeHtml(found.itemName || found.category)}</div>
        <div class="cell-sub">${escapeHtml(found.location || "—")} · found ${formatDate(found.dateFound)}</div></div>
      </div>
      <div class="report-list mt-4">
        ${candidates.length ? candidates.map(({ lost, score }, i) => `
          <div class="report-row" style="--i:${i};padding:12px 4px">
            ${thumbHtml(lost, "thumb-sm")}
            <div style="min-width:0">
              <div class="cell-title truncate">${escapeHtml(lost.itemName)}</div>
              <div class="cell-sub truncate">${escapeHtml(lost.user?.name || "Unknown")} · ${escapeHtml(lost.location || "—")} · lost ${formatDate(lost.dateLost)}</div>
            </div>
            <div class="report-side">
              <span class="badge ${score / maxScore >= 0.7 ? "badge-green" : score / maxScore >= 0.48 ? "badge-blue" : "badge-amber"}">${Math.round((score / maxScore) * 100)}%</span>
              <button class="btn btn-primary btn-sm" data-link="${lost._id}">Link</button>
            </div>
          </div>`).join("") : emptyHtml({ iconName: "inbox", title: "No lost reports waiting", text: "Nobody has an open lost report right now." })}
      </div>`;

    overlay.querySelector(".modal-body").addEventListener("click", async e => {
      const link = e.target.closest("[data-link]");
      if (!link) return;
      try {
        const data = await withLoading(link, () => apiFetch("/api/admin/match", { method: "POST", json: { foundId, lostId: link.dataset.link } }));
        closeModal(overlay);
        toast.success(data.message, { title: "Linked" });
        refreshAll();
      } catch (error) {
        toast.error(error.message);
      }
    });
  } catch (error) {
    overlay.querySelector(".modal-body").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
  }
}

// --- CSV export (needs the auth header, so it can't be a plain link) ---
async function exportCsv(type) {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/export?type=${type}`, { headers: { Authorization: `Bearer ${Session.token()}` } });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `${type}-reports.csv`;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`Downloaded ${name}`);
  } catch (error) {
    toast.error(error.message);
  }
}

// --- Loading ---
async function loadOverview() {
  const [stats, analytics] = await Promise.all([apiFetch("/api/admin/stats"), apiFetch("/api/admin/analytics")]);
  admin.stats = stats;
  admin.analytics = analytics;
  renderKpis();
  renderDaysChart(analytics.days);
  renderCategoryChart(analytics.categories);
  renderLocations(analytics.locations);
  renderLeaders(analytics.helpers);
}

async function refreshAll() {
  try {
    await Promise.all([loadOverview(), loadMatches()]);
    loadItems();
    refreshNavBadges();
  } catch (error) {
    toast.error(error.message);
  }
}

// --- Events ---
document.addEventListener("click", e => {
  const target = e.target.closest("[data-review],[data-approve],[data-reject-match],[data-candidates],[data-page],[data-export],[data-goto]");
  if (!target) return;
  const d = target.dataset;
  if (d.review) openReview(d.review);
  else if (d.approve) approve(d.approve, target);
  else if (d.rejectMatch) rejectMatch(d.rejectMatch);
  else if (d.candidates) openCandidates(d.candidates);
  else if (d.export) exportCsv(d.export);
  else if (d.goto) showTab(d.goto);
  else if (d.page && !target.disabled) {
    admin.browser.page = Number(d.page);
    loadItems();
  }
});

document.getElementById("matchSearch").addEventListener("input", debounce(() => loadMatches().catch(err => toast.error(err.message))));

initSegmented(document.getElementById("typeSwitch"), type => {
  Object.assign(admin.browser, { type, status: "", page: 1 });
  renderStatusFilter();
  loadItems();
});
document.getElementById("statusFilter").addEventListener("change", e => {
  Object.assign(admin.browser, { status: e.target.value, page: 1 });
  loadItems();
});
document.getElementById("categoryFilter").addEventListener("change", e => {
  Object.assign(admin.browser, { category: e.target.value, page: 1 });
  loadItems();
});
document.getElementById("itemSearch").addEventListener("input", debounce(e => {
  Object.assign(admin.browser, { q: e.target.value.trim(), page: 1 });
  loadItems();
}, 300));

document.getElementById("toggleDaysTable").addEventListener("click", e => {
  const button = e.currentTarget;
  const showTable = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(showTable));
  button.innerHTML = showTable ? `${icon("chart-column", "icon-sm")} Chart` : `${icon("table-2", "icon-sm")} Table`;
  document.getElementById("daysChart").hidden = showTable;
  document.getElementById("daysTable").hidden = !showTable;
});

document.getElementById("refreshBtn").addEventListener("click", async e => {
  const button = e.currentTarget;
  button.querySelector("svg").animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 600, easing: "ease-in-out" });
  await refreshAll();
  toast.info("Up to date");
});

window.addEventListener("resize", debounce(() => {
  if (admin.analytics && admin.tab === "overview") renderDaysChart(admin.analytics.days);
}, 150));

renderStatusFilter();
showTab(admin.tab);
document.getElementById("matchList").innerHTML = skeletonRows(3);
document.getElementById("itemsBody").innerHTML = `<tr><td colspan="7">${skeletonRows(3)}</td></tr>`;
refreshAll();
