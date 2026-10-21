/* Lost / found report form (the page's data-kind picks which) */

const KIND = document.body.dataset.kind;
const IS_LOST = KIND === "lost";
// The server accepts up to 4 MB; bigger photos are resized before upload
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 1800;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const form = document.getElementById("reportForm");
const fields = {
  itemName: document.getElementById("itemName"),
  location: document.getElementById("location"),
  date: document.getElementById("date"),
  description: document.getElementById("description"),
  keyword: document.getElementById("keywordInput")
};
const report = { category: "", keywords: [], image: null };

const toDateInput = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgoValue = days => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateInput(d);
};

// --- Category chips ---
function renderCategories() {
  document.getElementById("categoryChips").innerHTML = CATEGORIES.map(c => `
    <button type="button" class="chip" role="radio" data-category="${escapeHtml(c.value)}"
      aria-pressed="${report.category === c.value}" aria-checked="${report.category === c.value}">
      ${icon(c.icon, "icon-sm")} ${escapeHtml(c.value)}
    </button>`).join("");
}

document.getElementById("categoryChips").addEventListener("click", e => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  report.category = chip.dataset.category;
  renderCategories();
  update();
});

// --- Date ---
fields.date.max = toDateInput(new Date());
fields.date.value = toDateInput(new Date());

function syncQuickDates() {
  document.querySelectorAll("#quickDates button").forEach(b => {
    b.setAttribute("aria-pressed", String(daysAgoValue(Number(b.dataset.days)) === fields.date.value));
  });
}

document.getElementById("quickDates").addEventListener("click", e => {
  const button = e.target.closest("[data-days]");
  if (!button) return;
  fields.date.value = daysAgoValue(Number(button.dataset.days));
  update();
});

document.getElementById("places").innerHTML = CAMPUS_PLACES.map(p => `<option value="${escapeHtml(p)}">`).join("");

// --- Keywords ---
const tagInput = document.getElementById("tagInput");

function renderTags() {
  tagInput.querySelectorAll(".tag").forEach(t => t.remove());
  fields.keyword.insertAdjacentHTML("beforebegin", report.keywords.map((k, i) => `
    <span class="tag">${escapeHtml(k)}<button type="button" data-remove-tag="${i}" aria-label="Remove ${escapeHtml(k)}">${icon("x", "icon-sm")}</button></span>`).join(""));
  fields.keyword.placeholder = report.keywords.length ? "" : "black, leather, sticker";
}

function addKeywords(text) {
  text.split(",").map(k => k.trim().toLowerCase()).filter(Boolean).forEach(k => {
    if (!report.keywords.includes(k) && report.keywords.length < 8) report.keywords.push(k.slice(0, 30));
  });
  fields.keyword.value = "";
  renderTags();
  update();
}

fields.keyword.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addKeywords(fields.keyword.value);
  } else if (e.key === "Backspace" && !fields.keyword.value && report.keywords.length) {
    report.keywords.pop();
    renderTags();
    update();
  }
});
fields.keyword.addEventListener("blur", () => { if (fields.keyword.value.trim()) addKeywords(fields.keyword.value); });
fields.keyword.addEventListener("paste", () => setTimeout(() => { if (fields.keyword.value.includes(",")) addKeywords(fields.keyword.value); }));
tagInput.addEventListener("click", e => {
  const remove = e.target.closest("[data-remove-tag]");
  if (remove) {
    report.keywords.splice(Number(remove.dataset.removeTag), 1);
    renderTags();
    update();
  }
  fields.keyword.focus();
});

// --- Photo ---
const photoArea = document.getElementById("photoArea");
let previewUrl = null;

// Re-encodes large photos as JPEG at most MAX_DIMENSION px on the long side.
// GIFs are left alone so animations survive.
async function shrinkImage(file) {
  if (file.type === "image/gif" || (file.size <= 1.5 * 1024 * 1024 && file.type !== "image/png")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_IMAGE_BYTES) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";   // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

async function setImage(original) {
  if (!original) return;
  if (!IMAGE_TYPES.includes(original.type)) return showError("That file isn't a supported image. Use JPG, PNG, WEBP or GIF.");
  if (original.size > MAX_SOURCE_BYTES) return showError("That image is too large. Try one under 25 MB.");

  let file = original;
  try {
    file = await shrinkImage(original);
  } catch {
    // Couldn't decode it here; send the original if it's small enough
  }
  if (file.size > MAX_IMAGE_BYTES) return showError("That image is over 4 MB even after resizing. Try a smaller one.");
  clearError();
  report.image = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  renderPhoto();
  update();
}

function renderPhoto() {
  const dropzone = document.getElementById("dropzone");
  let preview = document.getElementById("photoPreview");
  if (!report.image) {
    preview?.remove();
    dropzone.hidden = false;
    return;
  }
  dropzone.hidden = true;
  if (!preview) {
    photoArea.insertAdjacentHTML("beforeend", `<div class="dropzone-preview" id="photoPreview"></div>`);
    preview = document.getElementById("photoPreview");
  }
  preview.innerHTML = `
    <img src="${previewUrl}" alt="Selected photo" data-preview="${previewUrl}">
    <div class="grow" style="min-width:0">
      <div class="cell-title truncate">${escapeHtml(report.image.name)}</div>
      <div class="cell-sub">${(report.image.size / 1024 / 1024).toFixed(2)} MB</div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="removePhoto">${icon("trash-2", "icon-sm")} Remove</button>`;
  preview.querySelector("#removePhoto").addEventListener("click", () => {
    report.image = null;
    document.getElementById("image").value = "";
    renderPhoto();
    update();
  });
}

document.getElementById("image").addEventListener("change", e => setImage(e.target.files[0]));
const dropzone = document.getElementById("dropzone");
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.add("is-dragging");
}));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => {
  e.preventDefault();
  dropzone.classList.remove("is-dragging");
}));
dropzone.addEventListener("drop", e => setImage(e.dataTransfer.files[0]));

// --- Live preview + section progress ---
function update() {
  syncQuickDates();
  document.getElementById("descCount").textContent = `${fields.description.value.length}/500`;

  const name = fields.itemName.value.trim();
  const done = {
    what: Boolean(report.category && (name || !IS_LOST)),
    where: Boolean(fields.location.value.trim() && fields.date.value),
    details: Boolean(fields.description.value.trim() || report.keywords.length),
    photo: Boolean(report.image)
  };
  document.querySelectorAll(".form-section").forEach(section => {
    section.classList.toggle("is-complete", done[section.dataset.section]);
  });

  const meta = categoryMeta(report.category);
  const thumb = report.image
    ? `<div class="thumb thumb-lg"><img src="${previewUrl}" alt=""></div>`
    : `<div class="thumb thumb-lg ${report.category ? meta.tint : ""}">${icon(report.category ? meta.icon : "image")}</div>`;
  document.getElementById("preview").innerHTML = `
    <div class="report-row" style="animation:none;grid-template-columns:auto minmax(0,1fr);border-bottom:none">
      ${thumb}
      <div style="min-width:0">
        <div class="report-name truncate">${escapeHtml(name || (report.category ? report.category : IS_LOST ? "Your item" : "Found item"))}</div>
        <div class="report-meta">
          ${report.category ? `<span>${icon(meta.icon)} ${escapeHtml(report.category)}</span>` : ""}
          <span>${icon("map-pin")} ${escapeHtml(fields.location.value.trim() || "Location")}</span>
          <span>${icon("calendar")} ${fields.date.value ? relativeDay(fields.date.value + "T12:00") : "Date"}</span>
        </div>
        ${report.keywords.length ? `<div class="row wrap mt-2" style="gap:4px">${report.keywords.map(k => `<span class="tag tag-static">${escapeHtml(k)}</span>`).join("")}</div>` : ""}
        <div class="mt-3">${statusBadge(IS_LOST ? "pending" : "unmatched")}</div>
      </div>
    </div>`;
}

[fields.itemName, fields.location, fields.date, fields.description].forEach(el => el.addEventListener("input", update));

// --- Submit ---
function showError(message) {
  document.getElementById("formError").innerHTML = `${icon("circle-alert")}<span>${escapeHtml(message)}</span>`;
}
function clearError() {
  document.getElementById("formError").textContent = "";
}

function validate() {
  if (IS_LOST && !fields.itemName.value.trim()) return ["itemName", "Give the item a name so you can recognise the report."];
  if (!report.category) return ["categoryChips", "Pick a category."];
  if (!fields.location.value.trim()) return ["location", IS_LOST ? "Add where you last had it." : "Add where you found it."];
  if (!fields.date.value) return ["date", "Add the date."];
  return null;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  clearError();
  if (fields.keyword.value.trim()) addKeywords(fields.keyword.value);

  const problem = validate();
  if (problem) {
    const [id, message] = problem;
    showError(message);
    const el = document.getElementById(id);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList?.add("is-invalid");
    setTimeout(() => el.classList?.remove("is-invalid"), 1600);
    if (el.focus && el.tagName !== "DIV") el.focus({ preventScroll: true });
    return;
  }

  const data = new FormData();
  data.append("itemName", fields.itemName.value.trim());
  data.append("category", report.category);
  data.append("description", fields.description.value.trim());
  data.append("keywords", report.keywords.join(","));
  data.append(IS_LOST ? "dateLost" : "dateFound", fields.date.value);
  data.append("location", fields.location.value.trim());
  if (report.image) data.append("image", report.image);

  try {
    const result = await withLoading(form.querySelector("[type=submit]"), () =>
      apiFetch(`/api/${KIND}`, { method: "POST", body: data }));
    showSuccess(result);
    refreshNavBadges();
  } catch (error) {
    showError(error.message);
  }
});

function showSuccess(result) {
  const matched = result.autoMatched;
  const item = result.data;
  const check = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  let title, text, actions;
  if (IS_LOST && matched) {
    title = "Good news: it may already be here";
    text = `Someone handed in an item that matches your ${item.itemName}. Take a look and claim it if it's yours.`;
    actions = `<a class="btn btn-primary btn-lg" href="history.html?open=${item._id}">${icon("eye")} Review the match</a>
               <a class="btn btn-secondary btn-lg" href="dashboard.html">Go to overview</a>`;
  } else if (IS_LOST) {
    title = "Report submitted";
    text = "We're checking it against everything that's handed in, and we'll email you the moment there's a match.";
    actions = `<a class="btn btn-primary btn-lg" href="browse.html">${icon("scan-search")} Browse found items</a>
               <a class="btn btn-secondary btn-lg" href="history.html">View my reports</a>`;
  } else if (matched) {
    title = "You just made someone's day";
    text = "This matches a lost report, and we've let the owner know. Please hand the item in at the admin office.";
    actions = `<a class="btn btn-primary btn-lg" href="history.html?tab=found">View my reports</a>
               <a class="btn btn-secondary btn-lg" href="found.html">Report another item</a>`;
  } else {
    title = "Thanks for reporting it";
    text = "We'll match it as soon as the owner reports it. Please hand the item in at the admin office.";
    actions = `<a class="btn btn-primary btn-lg" href="history.html?tab=found">View my reports</a>
               <a class="btn btn-secondary btn-lg" href="found.html">Report another item</a>`;
  }

  document.getElementById("formLayout").innerHTML = `
    <div class="card success-card" style="grid-column:1/-1;max-width:640px;margin:0 auto;width:100%" data-animate>
      <div class="success-mark ${matched ? "accent" : ""}">${matched ? icon("sparkles", "icon-xl") : check}</div>
      <h2 class="page-title">${escapeHtml(title)}</h2>
      <p class="page-desc" style="margin:10px auto 0">${escapeHtml(text)}</p>
      <div class="row wrap mt-8" style="justify-content:center">${actions}</div>
    </div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (matched) celebrate();
}

// A short confetti burst from the success card
function celebrate() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const mark = document.querySelector(".success-mark");
  const rect = mark.getBoundingClientRect();
  const colors = ["#7c5cff", "#ec4899", "#22c55e", "#f59e0b", "#3b82f6"];
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 36 + Math.random() * 0.3;
    const distance = 90 + Math.random() * 120;
    Object.assign(piece.style, {
      position: "fixed", left: `${rect.left + rect.width / 2}px`, top: `${rect.top + rect.height / 2}px`,
      width: "7px", height: "11px", borderRadius: "2px", background: colors[i % colors.length],
      pointerEvents: "none", zIndex: 400
    });
    document.body.appendChild(piece);
    piece.animate([
      { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
      { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 60}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" }).finished.then(() => piece.remove());
  }
}

// --- Prefill from ?category=&name=&location= (e.g. from the browse page) ---
const prefill = new URLSearchParams(window.location.search);
if (CATEGORIES.some(c => c.value === prefill.get("category"))) report.category = prefill.get("category");
if (prefill.get("name")) fields.itemName.value = prefill.get("name").slice(0, 80);
if (prefill.get("location")) fields.location.value = prefill.get("location").slice(0, 80);

renderCategories();
renderTags();
update();
