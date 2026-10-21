/* My reports: lost/found tabs, status filters, match review, claims, withdrawals */

const query = new URLSearchParams(window.location.search);
const state = {
  tab: query.get("tab") === "found" ? "found" : "lost",
  status: "all",
  q: "",
  lost: [],
  found: []
};

const FILTERS = {
  lost: ["all", "pending", "matched", "claimed", "returned"],
  found: ["all", "unmatched", "matched", "claimed", "returned"]
};
const FILTER_LABELS = { all: "All", pending: "Searching", unmatched: "Waiting for owner", matched: "Match found", claimed: "Claim in review", returned: "Returned" };

// What the finder sees for each stage of their found report
const FOUND_NOTES = {
  unmatched: "Waiting for the owner to report it",
  matched: "Owner notified, waiting for their claim",
  claimed: "Owner claimed it, an admin is verifying",
  returned: "Back with its owner. Thank you!"
};

function items() {
  return state[state.tab];
}

function visibleItems() {
  const q = state.q.toLowerCase();
  return items().filter(item =>
    (state.status === "all" || itemStage(item) === state.status) &&
    (!q || [item.itemName, item.category, item.location, item.description].some(v => v && v.toLowerCase().includes(q)))
  );
}

function renderFilters() {
  const counts = items().reduce((acc, item) => {
    const stage = itemStage(item);
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});
  counts.all = items().length;

  document.getElementById("statusFilters").innerHTML = FILTERS[state.tab]
    .filter(key => key === "all" || counts[key])
    .map(key => `
      <button class="chip" data-status="${key}" aria-pressed="${state.status === key}">
        ${FILTER_LABELS[key]} <span class="chip-count">${counts[key] || 0}</span>
      </button>`).join("");
}

function rowActions(item) {
  const stage = itemStage(item);
  const menuId = `menu-${item._id}`;
  const canWithdraw = state.tab === "lost" ? item.status === "pending" : item.status === "unmatched";

  let primary = "";
  if (state.tab === "lost" && stage === "matched") {
    primary = `<button class="btn btn-accent btn-sm" data-review="${item._id}">${icon("eye", "icon-sm")} Review match</button>`;
  } else if (state.tab === "lost" && (stage === "claimed" || stage === "returned")) {
    primary = `<button class="btn btn-secondary btn-sm" data-review="${item._id}">View</button>`;
  }

  const menu = canWithdraw ? `
    <div class="menu-anchor">
      <button class="btn btn-ghost btn-icon btn-sm" data-menu="${menuId}" aria-expanded="false" aria-label="More actions">${icon("ellipsis")}</button>
      <div class="menu menu-right" id="${menuId}">
        <button class="menu-item danger" data-withdraw="${item._id}">${icon("trash-2")} Withdraw report</button>
      </div>
    </div>` : "";

  return `${statusBadge(stage)}${primary}${menu}`;
}

function renderList() {
  const list = document.getElementById("reportList");
  const rows = visibleItems();
  document.getElementById("countLost").textContent = state.lost.length;
  document.getElementById("countFound").textContent = state.found.length;

  if (!items().length) {
    list.innerHTML = state.tab === "lost"
      ? emptyHtml({ iconName: "search-x", title: "No lost items reported", text: "Report something you've lost and we'll start matching it right away.", action: `<a class="btn btn-primary btn-sm" href="lost.html">${icon("plus", "icon-sm")} Report a lost item</a>` })
      : emptyHtml({ iconName: "hand-heart", title: "No found items reported", text: "Found something on campus? Report it so the owner can get it back.", action: `<a class="btn btn-primary btn-sm" href="found.html">${icon("plus", "icon-sm")} Report a found item</a>` });
    return;
  }
  if (!rows.length) {
    list.innerHTML = emptyHtml({ iconName: "search", title: "No reports match", text: "Try a different filter or search." });
    return;
  }

  list.innerHTML = rows.map((item, i) => {
    const stage = itemStage(item);
    const date = state.tab === "lost" ? item.dateLost : item.dateFound;
    return `
      <div class="report-row" style="--i:${i}">
        ${thumbHtml(item, "thumb-lg")}
        <div style="min-width:0">
          <div class="report-name truncate">${escapeHtml(item.itemName || item.category)}</div>
          <div class="report-meta">
            <span>${icon(categoryMeta(item.category).icon)} ${escapeHtml(item.category)}</span>
            <span>${icon("map-pin")} ${escapeHtml(item.location || "—")}</span>
            <span>${icon("calendar")} ${state.tab === "lost" ? "Lost" : "Found"} ${formatDate(date)}</span>
            <span class="subtle">Reported ${timeAgo(item.createdAt)}</span>
          </div>
          <div class="report-steps">${stepsHtml(stage)}</div>
          ${state.tab === "found" ? `<div class="text-xs muted mt-2">${FOUND_NOTES[stage] || ""}</div>` : ""}
        </div>
        <div class="report-side">${rowActions(item)}</div>
      </div>`;
  }).join("");
}

function render() {
  renderFilters();
  renderList();
}

async function load() {
  document.getElementById("reportList").innerHTML = skeletonRows(4);
  try {
    const [lost, found] = await Promise.all([apiFetch("/api/lost/my"), apiFetch("/api/found/my")]);
    state.lost = lost;
    state.found = found;
    render();
  } catch (error) {
    document.getElementById("reportList").innerHTML = emptyHtml({ iconName: "wifi-off", title: "Couldn't load your reports", text: error.message });
  }
}

// --- Match review ---
async function openMatch(lostId) {
  const overlay = createModal({
    id: "matchModal",
    size: "modal-lg",
    title: "Loading match…",
    body: `<div class="skeleton" style="height:320px;border-radius:14px"></div>`
  });
  openModal(overlay);

  try {
    const { lost, found, maxScore } = await apiFetch(`/api/lost/${lostId}/match`);
    overlay.querySelector(".modal-title").textContent = lost.status === "returned"
      ? `Your ${lost.itemName} is back`
      : `Is this your ${lost.itemName}?`;
    overlay.querySelector(".modal-header .grow").insertAdjacentHTML("beforeend",
      `<p class="modal-desc">Compare your report with what was handed in. The finder stays anonymous.</p>`);

    overlay.querySelector(".modal-body").innerHTML = `
      <div class="compare">
        ${compareCardHtml("Your report", lost, "lost")}
        <div class="compare-link"><span class="line"></span>${matchRingHtml(found.matchScore, maxScore)}<span class="line"></span></div>
        ${compareCardHtml("Found item", found, "found")}
      </div>
      <div class="mt-4">${claimSection(lost, found)}</div>`;
    animateRings(overlay);

    const footer = document.createElement("div");
    footer.className = "modal-footer";
    footer.innerHTML = claimFooter(lost);
    overlay.querySelector(".modal").appendChild(footer);

    const proof = overlay.querySelector("#proofInput");
    if (proof) {
      const counter = overlay.querySelector("#proofCount");
      proof.addEventListener("input", () => { counter.textContent = `${proof.value.trim().length}/10 min`; });
    }
  } catch (error) {
    overlay.querySelector(".modal-title").textContent = "Couldn't load this match";
    overlay.querySelector(".modal-body").innerHTML = `<div class="form-error">${escapeHtml(error.message)}</div>`;
  }
}

function claimSection(lost, found) {
  if (lost.status === "returned") {
    return `<div class="notice notice-success">${icon("party-popper")}<span>Returned to you on ${formatDate(lost.returnedAt, { year: "numeric" })}. Glad you got it back!</span></div>`;
  }
  if (lost.status === "claimed") {
    return `
      <div class="proof">
        <div class="proof-label">Your claim</div>
        <p>${escapeHtml(found.claim?.proof)}</p>
      </div>
      <div class="notice notice-violet mt-3">${icon("clock")}<span>Submitted ${found.claim?.submittedAt ? timeAgo(found.claim.submittedAt) : ""}. An admin is verifying it and will arrange the handover. We'll notify you.</span></div>`;
  }
  return `
    <div class="field">
      <label class="label" for="proofInput">Prove it's yours <span class="char-count" id="proofCount">0/10 min</span></label>
      <textarea id="proofInput" class="textarea" maxlength="500"
        placeholder="Describe something only the owner would know: what's inside, marks or stickers, the lock screen, a serial number…"></textarea>
      <span class="hint">An admin compares this with the item before handing it over.</span>
    </div>
    <div class="form-error mt-3" id="claimError" role="alert"></div>`;
}

function claimFooter(lost) {
  if (lost.status === "matched") {
    return `
      <button class="btn btn-ghost" data-reject="${lost._id}">${icon("x", "icon-sm")} Not mine</button>
      <button class="btn btn-primary" data-submit-claim="${lost._id}">${icon("hand", "icon-sm")} This is mine, submit claim</button>`;
  }
  if (lost.status === "claimed") {
    return `
      <button class="btn btn-danger-ghost btn-ghost" data-reject="${lost._id}">It's not mine after all</button>
      <button class="btn btn-secondary" data-close>Close</button>`;
  }
  return `<button class="btn btn-secondary" data-close>Close</button>`;
}

async function submitClaim(lostId, button) {
  const proof = document.getElementById("proofInput").value.trim();
  const errorBox = document.getElementById("claimError");
  errorBox.textContent = "";
  if (proof.length < 10) {
    errorBox.innerHTML = `${icon("circle-alert")}<span>Describe something only the owner would know (at least 10 characters).</span>`;
    return;
  }
  try {
    const data = await withLoading(button, () => apiFetch(`/api/lost/${lostId}/claim`, { method: "POST", json: { proof } }));
    closeModal("matchModal");
    toast.success(data.message, { title: "Claim submitted" });
    load();
    refreshNavBadges();
  } catch (error) {
    errorBox.innerHTML = `${icon("circle-alert")}<span>${escapeHtml(error.message)}</span>`;
  }
}

async function rejectMatch(lostId) {
  const ok = await confirmDialog({
    title: "Not your item?",
    message: "We'll unlink it and keep looking. This item won't be suggested to you again.",
    confirmText: "Yes, not mine",
    iconName: "search"
  });
  if (!ok) return;
  try {
    const data = await apiFetch(`/api/lost/${lostId}/reject-match`, { method: "POST" });
    closeModal("matchModal");
    toast.info(data.message);
    load();
    loadNotifications();
    refreshNavBadges();
  } catch (error) {
    toast.error(error.message);
  }
}

async function withdraw(id) {
  const ok = await confirmDialog({
    title: "Withdraw this report?",
    message: state.tab === "lost"
      ? "Do this if you've found it yourself. The report and its photo are deleted."
      : "The report and its photo are deleted, and it won't be matched with anyone.",
    confirmText: "Withdraw report",
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/api/${state.tab}/${id}`, { method: "DELETE" });
    toast.success("Report withdrawn");
    load();
  } catch (error) {
    toast.error(error.message);
  }
}

// --- Events ---
const tabs = initTabs(document.getElementById("tabs"), value => {
  state.tab = value;
  state.status = "all";
  history.replaceState(null, "", `?tab=${value}`);
  render();
});
if (state.tab === "found") {
  document.querySelectorAll("#tabs .tab").forEach(t => t.setAttribute("aria-selected", String(t.dataset.value === "found")));
  tabs.move();
}

document.getElementById("statusFilters").addEventListener("click", e => {
  const chip = e.target.closest("[data-status]");
  if (!chip) return;
  state.status = chip.dataset.status;
  render();
});

document.getElementById("search").addEventListener("input", debounce(e => {
  state.q = e.target.value.trim();
  renderList();
}, 150));

document.addEventListener("click", e => {
  const review = e.target.closest("[data-review]");
  if (review) return openMatch(review.dataset.review);
  const submit = e.target.closest("[data-submit-claim]");
  if (submit) return submitClaim(submit.dataset.submitClaim, submit);
  const reject = e.target.closest("[data-reject]");
  if (reject) return rejectMatch(reject.dataset.reject);
  const withdrawButton = e.target.closest("[data-withdraw]");
  if (withdrawButton) return withdraw(withdrawButton.dataset.withdraw);
});

load().then(() => {
  // Deep link from the dashboard / notifications: history.html?open=<lostId>
  const openId = query.get("open");
  if (openId && state.lost.some(item => item._id === openId)) openMatch(openId);
});
