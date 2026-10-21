/* Browse unclaimed found items and claim one as yours */

const browse = { q: "", category: "", page: 1, pages: 1, items: [] };
let myOpenReports = null;   // pending lost reports, loaded when a claim starts

function renderCategoryFilters() {
  const all = [{ value: "", icon: "layout-grid", label: "All" }, ...CATEGORIES.map(c => ({ ...c, label: c.value }))];
  document.getElementById("categoryFilters").innerHTML = all.map(c => `
    <button class="chip" data-category="${escapeHtml(c.value)}" aria-pressed="${browse.category === c.value}">
      ${icon(c.icon, "icon-sm")} ${escapeHtml(c.label)}
    </button>`).join("");
}

function skeletonCards(count) {
  return Array.from({ length: count }, () => `
    <div class="card item-card">
      <div class="skeleton" style="aspect-ratio:4/3;border-radius:14px 14px 0 0"></div>
      <div class="item-body"><div class="skeleton skeleton-title" style="width:70%"></div><div class="skeleton skeleton-text" style="width:50%"></div><div class="skeleton" style="height:30px;margin-top:8px"></div></div>
    </div>`).join("");
}

async function loadItems({ append = false } = {}) {
  const grid = document.getElementById("grid");
  const more = document.getElementById("loadMore");
  if (!append) {
    browse.page = 1;
    grid.innerHTML = skeletonCards(8);
  }

  const params = new URLSearchParams({ page: browse.page, limit: 12 });
  if (browse.q) params.set("q", browse.q);
  if (browse.category) params.set("category", browse.category);

  try {
    const data = await withLoading(append ? more : null, () => apiFetch(`/api/found/browse?${params}`));
    browse.pages = data.pages;
    browse.items = append ? [...browse.items, ...data.items] : data.items;

    document.getElementById("resultCount").textContent = `${plural(data.total, "item")} waiting for an owner`;
    if (!browse.items.length) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyHtml({
        iconName: "package-open",
        title: browse.q || browse.category ? "Nothing matches that search" : "Nothing waiting to be claimed",
        text: browse.q || browse.category
          ? "Try another word or category. If you've lost something, report it and we'll match it when it turns up."
          : "When someone hands in an item, it shows up here.",
        action: `<a class="btn btn-primary btn-sm" href="lost.html">${icon("plus", "icon-sm")} Report a lost item</a>`
      })}</div>`;
    } else {
      const html = data.items.map((item, i) => foundCardHtml(item, i)).join("");
      if (append) grid.insertAdjacentHTML("beforeend", html);
      else grid.innerHTML = html;
    }
    more.hidden = browse.page >= browse.pages;
  } catch (error) {
    grid.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyHtml({ iconName: "wifi-off", title: "Couldn't load found items", text: error.message })}</div>`;
  }
}

// --- Claim flow ---
async function openClaim(foundId) {
  let item = browse.items.find(i => i._id === foundId);
  if (!item) {
    // Deep link from the dashboard: look it up
    try {
      const all = await apiFetch(`/api/found/browse?limit=48`);
      item = all.items.find(i => i._id === foundId);
    } catch { /* handled below */ }
  }
  if (!item) return toast.error("This item has already been claimed.");

  if (!myOpenReports) {
    try {
      myOpenReports = (await apiFetch("/api/lost/my")).filter(r => r.status === "pending");
    } catch (error) {
      return toast.error(error.message);
    }
  }

  const meta = categoryMeta(item.category);
  // Best guess: a report in the same category
  const guess = myOpenReports.find(r => r.category === item.category) || myOpenReports[0];
  const reportLink = `lost.html?${new URLSearchParams({ category: item.category, name: item.itemName || "" })}`;

  const reportsHtml = myOpenReports.length
    ? `<div class="option-list" role="radiogroup">
        ${myOpenReports.map(r => `
          <label class="option">
            <input type="radio" name="lostReport" value="${r._id}" ${r === guess ? "checked" : ""}>
            ${thumbHtml(r, "thumb-sm")}
            <span class="grow" style="min-width:0">
              <span class="cell-title truncate" style="display:block">${escapeHtml(r.itemName)}</span>
              <span class="cell-sub">${escapeHtml(r.category)} · lost ${formatDate(r.dateLost)} · ${escapeHtml(r.location || "")}</span>
            </span>
            ${r.category === item.category ? `<span class="badge badge-accent">Same category</span>` : ""}
          </label>`).join("")}
      </div>`
    : `<div class="notice notice-amber">${icon("info")}<span>To claim an item, first report what you lost. It takes a minute, and keeps a record for the admin.
         <a class="link" href="${reportLink}">Report it now</a></span></div>`;

  const overlay = createModal({
    id: "claimModal",
    size: "modal-md",
    title: "Claim this item",
    desc: "Tell us which of your reports it is, and prove it's yours.",
    body: `
      <div class="row" style="gap:14px;padding:12px;border-radius:12px;background:var(--surface-sunken);box-shadow:0 0 0 1px var(--border)">
        ${item.image ? thumbHtml(item, "thumb-lg") : `<div class="thumb thumb-lg ${meta.tint}">${icon(meta.icon)}</div>`}
        <div style="min-width:0">
          <div class="cell-title">${escapeHtml(item.itemName || item.category)}</div>
          <div class="cell-sub">${escapeHtml(item.location || "")} · found ${relativeDay(item.dateFound, true)}</div>
          <div class="cell-sub row" style="gap:4px;margin-top:4px">${icon("lock", "icon-sm")} Description hidden for privacy</div>
        </div>
      </div>
      <div class="field mt-6">
        <span class="label">Which of your reports is this?</span>
        ${reportsHtml}
      </div>
      ${myOpenReports.length ? `
      <div class="field mt-4">
        <label class="label" for="claimProof">Prove it's yours</label>
        <textarea class="textarea" id="claimProof" maxlength="500" placeholder="Something only the owner would know: what's inside, marks or stickers, the lock screen, a serial number…"></textarea>
        <span class="hint">An admin compares this with the item before handing it over.</span>
      </div>
      <div class="form-error mt-3" id="claimError" role="alert"></div>` : ""}`,
    footer: myOpenReports.length
      ? `<button class="btn btn-secondary" data-close>Cancel</button>
         <button class="btn btn-primary" id="submitClaim">${icon("hand", "icon-sm")} Submit claim</button>`
      : `<button class="btn btn-secondary" data-close>Cancel</button>
         <a class="btn btn-primary" href="${reportLink}">${icon("plus", "icon-sm")} Report it as lost</a>`
  });
  openModal(overlay);

  overlay.querySelector("#submitClaim")?.addEventListener("click", async e => {
    const lostId = overlay.querySelector("input[name=lostReport]:checked")?.value;
    const proof = overlay.querySelector("#claimProof").value.trim();
    const errorBox = overlay.querySelector("#claimError");
    const fail = message => { errorBox.innerHTML = `${icon("circle-alert")}<span>${escapeHtml(message)}</span>`; };
    errorBox.textContent = "";
    if (!lostId) return fail("Pick the report this item belongs to.");
    if (proof.length < 10) return fail("Describe something only the owner would know (at least 10 characters).");

    try {
      const data = await withLoading(e.currentTarget, () => apiFetch(`/api/found/${item._id}/claim`, { method: "POST", json: { lostId, proof } }));
      closeModal(overlay);
      toast.success(data.message, { title: "Claim submitted" });
      myOpenReports = myOpenReports.filter(r => r._id !== lostId);
      removeCard(item._id);
      refreshNavBadges();
    } catch (error) {
      fail(error.message);
    }
  });
}

function removeCard(id) {
  const card = document.querySelector(`.item-card[data-id="${id}"]`);
  browse.items = browse.items.filter(i => i._id !== id);
  if (!card) return;
  card.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.94)" }], { duration: 250, easing: "ease-in" })
    .finished.then(() => {
      card.remove();
      if (!browse.items.length) loadItems();
    });
}

// --- Events ---
renderCategoryFilters();

document.getElementById("categoryFilters").addEventListener("click", e => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  browse.category = chip.dataset.category;
  renderCategoryFilters();
  loadItems();
});

document.getElementById("search").addEventListener("input", debounce(e => {
  browse.q = e.target.value.trim();
  loadItems();
}, 300));

document.getElementById("loadMore").addEventListener("click", () => {
  browse.page++;
  loadItems({ append: true });
});

document.getElementById("grid").addEventListener("click", e => {
  const button = e.target.closest("[data-claim]");
  if (button) openClaim(button.dataset.claim);
});

loadItems().then(() => {
  const claimId = new URLSearchParams(window.location.search).get("claim");
  if (claimId) openClaim(claimId);
});
