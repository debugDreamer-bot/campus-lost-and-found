/* Login, signup, forgot password and reset password */

const params = new URLSearchParams(window.location.search);

// Only follow ?next= to one of our own pages
function nextPage(role) {
  const next = params.get("next");
  if (next && /^[a-z]+\.html$/.test(next)) return next;
  return role === "admin" ? "admin.html" : "dashboard.html";
}

function showError(message) {
  const box = document.getElementById("formError");
  box.textContent = "";
  // Re-adding the text restarts the shake animation
  requestAnimationFrame(() => { box.innerHTML = `${icon("circle-alert")}<span>${escapeHtml(message)}</span>`; });
}

function clearError() {
  document.getElementById("formError").textContent = "";
}

async function postJson(path, payload) {
  return apiFetch(path, { method: "POST", json: payload, auth: false });
}

async function signIn(email, password) {
  const data = await postJson("/api/auth/login", { email, password });
  Session.save(data.token, data.user);
  window.location.href = nextPage(data.user.role);
}

// 0–4 based on length and character variety
function passwordScore(password) {
  if (!password) return 0;
  let score = password.length >= 6 ? 1 : 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const STRENGTH_HINTS = [
  "Use 8+ characters with a mix of letters, numbers and symbols.",
  "Weak. Try a longer password.",
  "Okay. Add upper-case letters or numbers.",
  "Good. A symbol would make it stronger.",
  "Strong password."
];

function bindStrengthMeter() {
  const input = document.getElementById("password");
  const meter = document.getElementById("strength");
  const hint = document.getElementById("strengthHint");
  if (!input || !meter) return;
  input.addEventListener("input", () => {
    const score = passwordScore(input.value);
    meter.dataset.score = score;
    if (hint) hint.textContent = STRENGTH_HINTS[input.value ? score : 0];
  });
}

// Show/hide password buttons
document.addEventListener("click", e => {
  const toggle = e.target.closest("[data-toggle-password]");
  if (toggle) {
    const input = document.getElementById(toggle.dataset.togglePassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.innerHTML = icon(show ? "eye-off" : "eye");
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    return;
  }
  if (e.target.closest("[data-theme-toggle]")) Theme.toggle(e);
});

// Already signed in? Skip the login and signup screens.
(() => {
  const token = Session.token();
  if (token && !Session.isExpired(token) && (document.getElementById("loginForm") || document.getElementById("registerForm"))) {
    window.location.href = nextPage(Session.user().role);
  }
})();

// --- Login ---
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  if (params.has("expired")) showError("Your session expired. Please log in again.");

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    if (!email || !password) return showError("Enter your email and password.");

    try {
      await withLoading(loginForm.querySelector("[type=submit]"), () => signIn(email, password));
    } catch (error) {
      showError(error.status === 404 ? "No account found for that email." : error.status === 401 ? "That password isn't right." : error.message);
    }
  });

  document.querySelectorAll("[data-demo]").forEach(button => {
    button.addEventListener("click", () => {
      document.getElementById("email").value = button.dataset.demo;
      document.getElementById("password").value = "demo1234";
      loginForm.requestSubmit();
    });
  });
}

// --- Register ---
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  let role = "student";
  initSegmented(document.getElementById("roleSwitch"), value => { role = value; });
  bindStrengthMeter();

  registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const prn = document.getElementById("prn").value.trim();
    const password = document.getElementById("password").value;

    if (!name || !email || !prn || !password) return showError("Fill in every field to continue.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError("That email address doesn't look right.");
    if (password.length < 6) return showError("Password must be at least 6 characters.");

    try {
      await withLoading(registerForm.querySelector("[type=submit]"), async () => {
        await postJson("/api/auth/register", { name, email, prn, password, role });
        await signIn(email, password);
      });
    } catch (error) {
      showError(error.message);
    }
  });
}

// --- Forgot password ---
const forgotForm = document.getElementById("forgotForm");
if (forgotForm) {
  forgotForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("email").value.trim();
    if (!email) return showError("Enter the email you signed up with.");

    try {
      await withLoading(forgotForm.querySelector("[type=submit]"), () => postJson("/api/auth/forgot-password", { email }));
      document.getElementById("forgotStep").hidden = true;
      document.getElementById("forgotDone").hidden = false;
    } catch (error) {
      showError(error.message);
    }
  });
}

// --- Reset password (token comes from the emailed link) ---
const resetForm = document.getElementById("resetForm");
if (resetForm) {
  bindStrengthMeter();
  const token = params.get("token");
  if (!token) showError("This reset link is invalid. Request a new one.");

  resetForm.addEventListener("submit", async e => {
    e.preventDefault();
    clearError();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!token) return showError("This reset link is invalid. Request a new one.");
    if (password.length < 6) return showError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return showError("Those passwords don't match.");

    try {
      await withLoading(resetForm.querySelector("[type=submit]"), () => postJson("/api/auth/reset-password", { token, password }));
      document.getElementById("resetStep").hidden = true;
      document.getElementById("resetDone").hidden = false;
      setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (error) {
      showError(error.message);
    }
  });
}
