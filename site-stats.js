const form = document.querySelector("#statsForm");
const tokenInput = document.querySelector("#statsToken");
const statusText = document.querySelector("#statsStatus");
const statsContent = document.querySelector("#statsContent");
const totalViews = document.querySelector("#totalViews");
const totalVisits = document.querySelector("#totalVisits");
const totalViewsNote = document.querySelector("#totalViewsNote");
const todayViews = document.querySelector("#todayViews");
const todayTrend = document.querySelector("#todayTrend");
const viewsPerVisit = document.querySelector("#viewsPerVisit");
const sevenDayViews = document.querySelector("#sevenDayViews");
const sevenDayNote = document.querySelector("#sevenDayNote");
const topPage = document.querySelector("#topPage");
const topPageNote = document.querySelector("#topPageNote");
const bestDay = document.querySelector("#bestDay");
const bestDayNote = document.querySelector("#bestDayNote");
const dailyChart = document.querySelector("#dailyChart");
const dailyStats = document.querySelector("#dailyStats");
const pageStats = document.querySelector("#pageStats");
const sourceStats = document.querySelector("#sourceStats");
const resetStatsButton = document.querySelector("#resetStatsButton");
const resetDayStatsButton = document.querySelector("#resetDayStatsButton");
const resetStatsDate = document.querySelector("#resetStatsDate");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadStats();
});

resetStatsButton?.addEventListener("click", async () => {
  await resetStats();
});

resetDayStatsButton?.addEventListener("click", async () => {
  const selectedDate = resetStatsDate?.value || "";

  if (!selectedDate) {
    window.alert("Please pick a date before resetting one day.");
    statusText.textContent = "Choose a date before using Reset Day.";
    resetStatsDate?.focus();
    return;
  }

  await resetStats(selectedDate);
});

async function resetStats(date = "") {
  const token = tokenInput.value.trim();
  if (!token) {
    statusText.textContent = "Enter the private counter token first.";
    return;
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    statusText.textContent = "Choose a valid day to reset.";
    return;
  }

  const confirmed = window.confirm(date
    ? `Reset site stats for ${formatFriendlyDate(date)} only?`
    : "Reset all site stats? This clears views, visits, top pages, and traffic sources.");
  if (!confirmed) {
    return;
  }

  statusText.textContent = date ? `Resetting stats for ${formatFriendlyDate(date)}.` : "Resetting site stats.";

  try {
    const resetUrl = new URL("/api/site-views", window.location.origin);
    resetUrl.searchParams.set("token", token);
    if (date) {
      resetUrl.searchParams.set("date", date);
    }

    const response = await fetch(resetUrl.toString(), {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to reset site stats.");
    }

    renderStats(payload.stats || buildEmptyStats());
    statusText.textContent = date ? `Stats reset for ${formatFriendlyDate(date)}.` : "Site stats reset.";
  } catch (error) {
    statusText.textContent = error.message || "Unable to reset site stats.";
  }
}

async function loadStats() {
  const token = tokenInput.value.trim();
  if (!token) {
    statusText.textContent = "Enter the private counter token first.";
    return;
  }

  statusText.textContent = "Loading private dashboard.";

  try {
    const response = await fetch(`/api/site-views?token=${encodeURIComponent(token)}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load site counter.");
    }

    renderStats(payload);
    statusText.textContent = `Updated ${formatDateTime(new Date())}.`;
  } catch (error) {
    statsContent.hidden = true;
    statusText.textContent = error.message || "Unable to load site counter.";
  }
}

function renderStats(payload) {
  const daily = Array.isArray(payload.daily) ? payload.daily : [];
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const referrers = Array.isArray(payload.referrers) ? payload.referrers : [];
  const totalViewCount = Number(payload.totalViews) || 0;
  const totalVisitCount = Number(payload.totalVisits) || 0;
  const today = daily[0] || { views: 0, visits: 0 };
  const yesterday = daily[1] || { views: 0, visits: 0 };
  const sevenDays = daily.slice(0, 7);
  const sevenDayViewCount = sumBy(sevenDays, "views");
  const bestDayEntry = [...daily].sort((first, second) => Number(second.views || 0) - Number(first.views || 0))[0];
  const topPageEntry = pages[0];

  totalViews.textContent = formatNumber(totalViewCount);
  totalVisits.textContent = formatNumber(totalVisitCount);
  totalViewsNote.textContent = `${formatNumber(pages.length)} tracked public page${pages.length === 1 ? "" : "s"}.`;
  todayViews.textContent = formatNumber(today.views);
  todayTrend.textContent = describeTrend(Number(today.views) || 0, Number(yesterday.views) || 0);
  viewsPerVisit.textContent = totalVisitCount ? (totalViewCount / totalVisitCount).toFixed(1) : "0.0";
  sevenDayViews.textContent = `${formatNumber(sevenDayViewCount)} views`;
  sevenDayNote.textContent = describeSevenDayPace(sevenDays);
  topPage.textContent = topPageEntry ? cleanPageLabel(topPageEntry.path) : "None yet";
  topPageNote.textContent = topPageEntry
    ? `${formatNumber(topPageEntry.views)} views, ${getShare(topPageEntry.views, totalViewCount)} of tracked traffic.`
    : "Your strongest page will appear here.";
  bestDay.textContent = bestDayEntry && Number(bestDayEntry.views) > 0 ? formatFriendlyDate(bestDayEntry.date) : "None yet";
  bestDayNote.textContent = bestDayEntry && Number(bestDayEntry.views) > 0
    ? `${formatNumber(bestDayEntry.views)} views and ${formatNumber(bestDayEntry.visits)} visits.`
    : "The highest-view day in the last 14 days.";

  renderDailyChart(daily);
  renderDailyRows(daily);
  renderPageRows(pages, totalViewCount);
  renderSourceRows(referrers);

  statsContent.hidden = false;
}

function buildEmptyStats() {
  return {
    totalViews: 0,
    totalVisits: 0,
    daily: Array.from({ length: 14 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - index);
      return {
        date: date.toISOString().slice(0, 10),
        views: 0,
        visits: 0
      };
    }),
    pages: [],
    referrers: []
  };
}

function renderDailyChart(daily) {
  const orderedDays = [...daily].reverse();
  const maxViews = Math.max(...orderedDays.map((day) => Number(day.views) || 0), 1);

  dailyChart.innerHTML = orderedDays.map((day) => {
    const views = Number(day.views) || 0;
    const height = Math.max((views / maxViews) * 100, views ? 8 : 3);

    return `
      <div class="bar-wrap" title="${escapeHtml(formatFriendlyDate(day.date))}: ${formatNumber(views)} views">
        <div class="bar" style="height: ${height}%"></div>
        <div class="bar-label">${escapeHtml(formatShortDate(day.date))}</div>
      </div>
    `;
  }).join("");
}

function renderDailyRows(daily) {
  dailyStats.innerHTML = daily.map((day) => `
    <article class="row">
      <div class="row-main">
        <span>${escapeHtml(formatFriendlyDate(day.date))}</span>
        <strong>${formatNumber(day.views)} views / ${formatNumber(day.visits)} visits</strong>
      </div>
    </article>
  `).join("") || emptyRow("No daily views yet", "0");
}

function renderPageRows(pages, totalViewCount) {
  const maxViews = Math.max(...pages.map((page) => Number(page.views) || 0), 1);

  pageStats.innerHTML = pages.map((page) => {
    const views = Number(page.views) || 0;
    const width = Math.max((views / maxViews) * 100, views ? 4 : 0);

    return `
      <article class="row">
        <div class="row-main">
          <span>${escapeHtml(cleanPageLabel(page.path))}</span>
          <strong>${formatNumber(views)} views</strong>
        </div>
        <div class="progress" aria-hidden="true"><i style="width: ${width}%"></i></div>
        <p>${getShare(views, totalViewCount)} of total tracked views.</p>
      </article>
    `;
  }).join("") || emptyRow("No page views yet", "0");
}

function renderSourceRows(referrers) {
  const fallback = `<span class="source-pill">Direct / unknown source</span>`;

  sourceStats.innerHTML = referrers.length
    ? referrers.slice(0, 8).map((source) => `
      <span class="source-pill">${escapeHtml(cleanSourceLabel(source.referrer))}: ${formatNumber(source.views)}</span>
    `).join("")
    : fallback;
}

function describeTrend(today, yesterday) {
  if (!today && !yesterday) {
    return "No views today yet.";
  }

  if (!yesterday) {
    return today ? "First tracked views compared with yesterday." : "No views today yet.";
  }

  const difference = today - yesterday;
  const percent = Math.round((difference / yesterday) * 100);

  if (difference > 0) {
    return `Up ${formatNumber(difference)} view${difference === 1 ? "" : "s"} from yesterday (${percent}%).`;
  }

  if (difference < 0) {
    return `Down ${formatNumber(Math.abs(difference))} from yesterday (${Math.abs(percent)}%).`;
  }

  return "Even with yesterday.";
}

function describeSevenDayPace(days) {
  const views = sumBy(days, "views");
  const visits = sumBy(days, "visits");

  if (!views) {
    return "No tracked views in the last 7 days yet.";
  }

  return `${formatNumber(visits)} visits with ${visits ? (views / visits).toFixed(1) : "0.0"} views per visit.`;
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function getShare(value, total) {
  const count = Number(value) || 0;
  const overall = Number(total) || 0;

  if (!count || !overall) {
    return "0%";
  }

  return `${Math.round((count / overall) * 100)}%`;
}

function cleanPageLabel(value) {
  const path = String(value || "/").trim() || "/";
  if (path === "/") {
    return "Homepage";
  }

  return path
    .replace(/^\//, "")
    .replace(/\.html$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanSourceLabel(value) {
  const referrer = String(value || "").trim();
  if (!referrer) {
    return "Direct";
  }

  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer.slice(0, 40);
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function formatFriendlyDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value || "").slice(5);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function emptyRow(label, value) {
  return `
    <article class="row">
      <div class="row-main">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
