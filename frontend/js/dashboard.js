/* Overview: greeting, stats, active reports, activity, leaderboard, recent finds */

const user = Session.user();
const firstName = user.name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(" ")[0];
document.getElementById("greeting").textContent = `${greeting()}, ${firstName}`;
document.getElementById("greetingSub").textContent =
  new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + " · Here's what's happening with your reports.";

function statCard({ label, iconName, value, sub, href, highlight }) {
  return `
    <div class="card stat ${highlight ? "is-highlight" : ""} ${href ? "card-interactive" : ""}">
      ${href ? `<a class="stat-link" href="${href}" aria-label="${escapeHtml(label)}"></a>` : ""}
      <div class="stat-label">${icon(iconName)} ${escapeHtml(label)}</div>
      <div class="stat-value" data-count="${value}">0</div>
      <div class="stat-sub">${escapeHtml(sub)}</div>
    </div>`;
}

function renderStats(lost, found) {
  const active = lost.filter(i => i.status !== "returned").length;
  const toReview = lost.filter(i => i.status === "matched").length;
  const returnedToMe = lost.filter(i => i.status === "returned").length;
  const helped = found.filter(i => i.status === "returned").length;

  const stats = document.getElementById("stats");
  stats.innerHTML = [
    statCard({ label: "Active reports", iconName: "search", value: active, sub: active ? "We're on the lookout" : "Nothing missing right now", href: "history.html" }),
    statCard({ label: "Matches to review", iconName: "sparkles", value: toReview, sub: toReview ? "Check if it's yours" : "We'll notify you", href: "history.html", highlight: toReview > 0 }),
    statCard({ label: "Returned to you", iconName: "package-check", value: returnedToMe, sub: "Items you got back" }),
    statCard({ label: "Items you returned", iconName: "hand-heart", value: helped, sub: helped ? "Thank you for helping!" : "Found something? Report it", href: helped ? "" : "found.html" })
  ].join("");
  stats.querySelectorAll("[data-count]").forEach(el => countUp(el, Number(el.dataset.count), { duration: 800 }));

  if (toReview) {
    const first = lost.find(i => i.status === "matched");
    document.getElementById("attention").innerHTML = `
      <div class="banner" data-animate>
        <div class="banner-icon">${icon("sparkles")}</div>
        <div class="grow">
          <div class="banner-title">${toReview === 1 ? `We may have found your ${escapeHtml(first.itemName)}` : `You have ${toReview} possible matches to review`}</div>
          <div class="banner-text">Compare the reports and claim it if it's yours. The sooner you claim, the sooner you get it back.</div>
        </div>
        <a class="btn btn-primary btn-sm" href="history.html?open=${first._id}">Review now ${icon("arrow-anim")}</a>
      </div>`;
  }
}

function renderActive(lost) {
  const list = document.getElementById("activeList");
  const active = lost.filter(i => i.status !== "returned").slice(0, 5);

  if (!active.length) {
    list.innerHTML = emptyHtml({
      iconName: "package-search",
      title: "Nothing missing",
      text: "When you report a lost item, you'll be able to follow its progress here.",
      action: `<a class="btn btn-primary btn-sm" href="lost.html">${icon("plus", "icon-sm")} Report a lost item</a>`
    });
    return;
  }

  list.innerHTML = active.map((item, i) => `
    <div class="report-row" style="--i:${i}">
      ${thumbHtml(item)}
      <div style="min-width:0">
        <div class="report-name truncate">${escapeHtml(item.itemName)}</div>
        <div class="report-meta">
          <span>${icon("map-pin")} ${escapeHtml(item.location || "—")}</span>
          <span>${icon("calendar")} Lost ${relativeDay(item.dateLost, true)}</span>
        </div>
        <div class="report-steps">${stepsHtml(item.status, "steps-compact")}</div>
      </div>
      <div class="report-side">
        ${item.status === "matched"
          ? `<a class="btn btn-accent btn-sm" href="history.html?open=${item._id}">${icon("eye", "icon-sm")} Review</a>`
          : statusBadge(item.status)}
      </div>
    </div>`).join("");
}

function renderActivity(notifications) {
  const box = document.getElementById("activity");
  if (!notifications.length) {
    box.innerHTML = `<p class="muted text-sm" style="padding:12px 0">No activity yet.</p>`;
    return;
  }
  box.innerHTML = notifications.slice(0, 5).map(n => {
    const [tone, iconName] = notificationTone(n.title);
    return `
      <div class="timeline-item">
        <span class="notif-icon ${tone}">${icon(iconName, "icon-sm")}</span>
        <div style="min-width:0">
          <div class="timeline-title">${escapeHtml(n.title)}</div>
          <div class="timeline-text">${timeAgo(n.createdAt)}</div>
        </div>
      </div>`;
  }).join("");
}

function renderLeaders(helpers) {
  const box = document.getElementById("leaders");
  if (!helpers.length) {
    box.innerHTML = `<p class="muted text-sm" style="padding:12px 0">Be the first to return something.</p>`;
    return;
  }
  box.innerHTML = helpers.map((h, i) => `
    <div class="leader">
      <span class="leader-rank ${i === 0 ? "top" : ""}">${i === 0 ? icon("crown", "icon-sm") : i + 1}</span>
      ${avatarHtml(h.name, "avatar-sm")}
      <span class="leader-name">${escapeHtml(h.name)}</span>
      <span class="leader-score">${plural(h.returned, "item")}</span>
    </div>`).join("");
}

function renderRecent(items) {
  const grid = document.getElementById("recentFound");
  if (!items.length) {
    grid.outerHTML = `<div class="card">${emptyHtml({ iconName: "inbox", title: "Nothing waiting to be claimed", text: "Found items that haven't been claimed will show up here." })}</div>`;
    return;
  }
  grid.innerHTML = items.map(foundCardHtml).join("");
  grid.addEventListener("click", e => {
    const button = e.target.closest("[data-claim]");
    if (button) window.location.href = `browse.html?claim=${button.dataset.claim}`;
  });
}

async function loadDashboard() {
  document.getElementById("activeList").innerHTML = skeletonRows(3);
  try {
    const [lost, found, notes, recent, board] = await Promise.all([
      apiFetch("/api/lost/my"),
      apiFetch("/api/found/my"),
      apiFetch("/api/notifications"),
      apiFetch("/api/found/browse?limit=4"),
      apiFetch("/api/stats/leaderboard").catch(() => ({ helpers: [] }))
    ]);
    renderStats(lost, found);
    renderActive(lost);
    renderActivity(notes.notifications);
    renderLeaders(board.helpers);
    renderRecent(recent.items);
  } catch (error) {
    toast.error(error.message);
  }
}

loadDashboard();
