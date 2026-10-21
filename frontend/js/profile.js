/* Settings: profile, password, appearance, impact */

let savedName = "";

async function loadProfile() {
  try {
    const me = await apiFetch("/api/auth/me");
    savedName = me.name;
    document.getElementById("name").value = me.name;
    document.getElementById("email").value = me.email;
    document.getElementById("prn").value = me.prn;
    document.getElementById("profileRole").textContent = me.role === "teacher" ? "Staff" : me.role[0].toUpperCase() + me.role.slice(1);
    document.getElementById("memberSince").textContent = `Member since ${formatDate(me.createdAt, { year: "numeric" })}`;
    renderIdentity(me.name);
  } catch (error) {
    toast.error(error.message);
  }
}

function renderIdentity(name) {
  document.getElementById("profileAvatar").innerHTML = avatarHtml(name, "avatar-lg");
  document.getElementById("profileName").textContent = name;
}

// --- Profile ---
const nameInput = document.getElementById("name");
const saveButton = document.getElementById("saveProfile");
nameInput.addEventListener("input", () => {
  saveButton.disabled = nameInput.value.trim() === savedName || nameInput.value.trim().length < 2;
});

document.getElementById("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const { data } = await withLoading(saveButton, () => apiFetch("/api/auth/me", { method: "PUT", json: { name: nameInput.value.trim() } }));
    savedName = data.name;
    Session.setName(data.name);
    renderIdentity(data.name);
    document.querySelector(".user-button .user-name").textContent = data.name;
    document.querySelector(".user-button .avatar").outerHTML = avatarHtml(data.name);
    saveButton.disabled = true;
    toast.success("Profile updated");
  } catch (error) {
    toast.error(error.message);
  }
});

// --- Password ---
const passwordForm = document.getElementById("passwordForm");
const newPassword = document.getElementById("newPassword");
newPassword.addEventListener("input", () => {
  const v = newPassword.value;
  let score = v.length >= 6 ? 1 : 0;
  if (v.length >= 8) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
  document.getElementById("strength").dataset.score = v ? Math.min(score, 4) : 0;
});

passwordForm.addEventListener("submit", async e => {
  e.preventDefault();
  const errorBox = document.getElementById("passwordError");
  const fail = message => { errorBox.innerHTML = `${icon("circle-alert")}<span>${escapeHtml(message)}</span>`; };
  errorBox.textContent = "";

  const currentPassword = document.getElementById("currentPassword").value;
  const next = newPassword.value;
  const confirmValue = document.getElementById("confirmPassword").value;
  if (!currentPassword) return fail("Enter your current password.");
  if (next.length < 6) return fail("New password must be at least 6 characters.");
  if (next !== confirmValue) return fail("The new passwords don't match.");

  try {
    await withLoading(passwordForm.querySelector("[type=submit]"), () =>
      apiFetch("/api/auth/password", { method: "PUT", json: { currentPassword, newPassword: next } }));
    passwordForm.reset();
    document.getElementById("strength").dataset.score = 0;
    toast.success("Password changed");
  } catch (error) {
    fail(error.message);
  }
});

// --- Appearance ---
function syncThemeOptions() {
  const mode = Theme.get();
  document.querySelectorAll("[data-theme-value]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeValue === mode)));
}
document.getElementById("themeOptions").addEventListener("click", e => {
  const option = e.target.closest("[data-theme-value]");
  if (!option) return;
  Theme.set(option.dataset.themeValue, e);
  syncThemeOptions();
});
document.addEventListener("themechange", syncThemeOptions);
document.getElementById("themeShortcut").textContent = `${MOD_KEY} J`;
syncThemeOptions();

// --- Impact ---
async function loadImpact() {
  try {
    const [lost, found] = await Promise.all([apiFetch("/api/lost/my"), apiFetch("/api/found/my")]);
    const returnedToMe = lost.filter(i => i.status === "returned").length;
    const helped = found.filter(i => i.status === "returned").length;
    const tiles = [
      ["Reports filed", lost.length + found.length, "file-text"],
      ["Returned to you", returnedToMe, "package-check"],
      ["You helped return", helped, "hand-heart"]
    ];
    document.getElementById("impact").innerHTML = tiles.map(([label, value, iconName]) => `
      <div class="card stat">
        <div class="stat-label">${icon(iconName)} ${label}</div>
        <div class="stat-value" data-count="${value}">0</div>
      </div>`).join("");
    document.querySelectorAll("#impact [data-count]").forEach(el => countUp(el, Number(el.dataset.count), { duration: 700 }));

    document.getElementById("achievement").innerHTML = helped
      ? `<div class="achievement">
           <span class="banner-icon">${icon("award")}</span>
           <div><div class="strong">Campus hero</div><div class="muted text-sm">You've helped ${plural(helped, "person", "people")} get their things back.</div></div>
         </div>`
      : `<div class="notice notice-neutral">${icon("sparkles")}<span>Return your first found item to earn the <b>Campus hero</b> badge.</span></div>`;
  } catch (error) {
    toast.error(error.message);
  }
}

loadProfile();
loadImpact();
