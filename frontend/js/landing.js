/* Landing page: nav state, live stats, category marquee, FAQ */

const signedIn = (() => {
  const token = Session.token();
  return Boolean(token && !Session.isExpired(token));
})();

// Signed-in visitors skip the login step
if (signedIn) {
  document.getElementById("navLogin").hidden = true;
  const cta = document.getElementById("navCta");
  cta.href = "dashboard.html";
  cta.firstChild.textContent = "Open dashboard ";
  document.querySelectorAll("[data-auth-href]").forEach(link => { link.href = link.dataset.authHref; });
}

// Nav gets a background once the page scrolls
const nav = document.getElementById("siteNav");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

document.addEventListener("click", e => {
  if (e.target.closest("[data-theme-toggle]")) Theme.toggle(e);
});

// Marquee: the list is rendered twice so the loop is seamless
const chips = CATEGORIES.map(c => `<span class="chip">${icon(c.icon)} ${c.value === "Others" ? "Calculators, umbrellas & more" : c.value}</span>`).join("");
document.getElementById("marquee").innerHTML = chips + chips;

// FAQ accordion
document.getElementById("faqList").addEventListener("click", e => {
  const button = e.target.closest(".faq-q");
  if (!button) return;
  const item = button.parentElement;
  const open = !item.classList.contains("open");
  item.classList.toggle("open", open);
  button.setAttribute("aria-expanded", String(open));
});

// Live numbers, counted up when the band scrolls into view
async function loadStats() {
  const band = document.querySelector(".stat-band");
  let stats;
  try {
    stats = await apiFetch("/api/stats/public", { auth: false });
  } catch {
    return; // keep the dashes
  }

  const days = stats.avgHoursToReturn === null ? null : stats.avgHoursToReturn / 24;
  const values = {
    returned: { value: stats.returned },
    returnRate: { value: stats.returnRate, suffix: "%" },
    avgDays: days === null ? null : days < 1
      ? { value: Math.max(1, Math.round(stats.avgHoursToReturn)), suffix: " hrs" }
      : { value: days, suffix: days < 1.05 ? " day" : " days", decimals: 1 },
    foundThisMonth: { value: stats.foundThisMonth }
  };

  const run = () => {
    band.querySelectorAll("[data-stat]").forEach(el => {
      const stat = values[el.dataset.stat];
      if (stat) countUp(el, stat.value, { suffix: stat.suffix || "", decimals: stat.decimals || 0 });
    });
  };
  band.classList.contains("in-view") ? run() : band.addEventListener("inview", run, { once: true });
}

document.getElementById("year").textContent = new Date().getFullYear();
loadStats();
