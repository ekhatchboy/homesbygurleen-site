const form = document.querySelector("#statsForm");
const tokenInput = document.querySelector("#statsToken");
const statusText = document.querySelector("#statsStatus");
const statsContent = document.querySelector("#statsContent");
const totalViews = document.querySelector("#totalViews");
const totalVisits = document.querySelector("#totalVisits");
const dailyStats = document.querySelector("#dailyStats");
const pageStats = document.querySelector("#pageStats");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const token = tokenInput.value.trim();
  if (!token) {
    statusText.textContent = "Enter the private counter token first.";
    return;
  }

  statusText.textContent = "Loading private counter.";

  try {
    const response = await fetch(`/api/site-views?token=${encodeURIComponent(token)}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load site counter.");
    }

    renderStats(payload);
    statusText.textContent = "Counter loaded.";
  } catch (error) {
    statsContent.hidden = true;
    statusText.textContent = error.message || "Unable to load site counter.";
  }
});

function renderStats(payload) {
  totalViews.textContent = formatNumber(payload.totalViews);
  totalVisits.textContent = formatNumber(payload.totalVisits);

  dailyStats.innerHTML = (payload.daily || []).map((day) => `
    <article class="row">
      <span>${escapeHtml(day.date)}</span>
      <strong>${formatNumber(day.views)} views / ${formatNumber(day.visits)} visits</strong>
    </article>
  `).join("");

  pageStats.innerHTML = (payload.pages || []).map((page) => `
    <article class="row">
      <span>${escapeHtml(page.path)}</span>
      <strong>${formatNumber(page.views)} views</strong>
    </article>
  `).join("") || `<article class="row"><span>No page views yet</span><strong>0</strong></article>`;

  statsContent.hidden = false;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
