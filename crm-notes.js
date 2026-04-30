const elements = {
  refreshButton: document.querySelector("#refreshActivityButton"),
  activityList: document.querySelector("#crmActivityList")
};

elements.refreshButton?.addEventListener("click", loadCrmActivity);
loadCrmActivity();

async function loadCrmActivity() {
  if (!elements.activityList) {
    return;
  }

  elements.activityList.innerHTML = `<div class="crm-empty-state">Loading recent CRM notes.</div>`;

  try {
    const response = await fetch(`/crm/activity?ts=${Date.now()}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load CRM notes.");
    }

    renderCrmActivity(Array.isArray(payload.changes) ? payload.changes : []);
  } catch (error) {
    elements.activityList.innerHTML = `<div class="crm-empty-state">${escapeHtml(error.message || "Unable to load CRM notes.")}</div>`;
  }
}

function renderCrmActivity(changes) {
  if (!changes.length) {
    elements.activityList.innerHTML = `<div class="crm-empty-state">No CRM changes have been logged yet.</div>`;
    return;
  }

  elements.activityList.innerHTML = changes.map((change) => {
    const action = String(change["Action"] || "Updated").trim();
    const leadName = String(change["Lead Name"] || change["Lead ID"] || "Lead").trim();
    const field = String(change["Field"] || "").trim();
    const oldValue = String(change["Old Value"] || "").trim();
    const newValue = String(change["New Value"] || "").trim();
    const timestamp = formatActivityTimestamp(change["Timestamp"]);
    const summary = buildActivitySummary(action, field, oldValue, newValue);

    return `
      <article class="crm-note-entry">
        <div class="crm-note-date">${escapeHtml(timestamp)}</div>
        <div>
          <strong>${escapeHtml(leadName)}</strong>
          <p>${escapeHtml(summary)}</p>
        </div>
        <span>${escapeHtml(action)}</span>
      </article>
    `;
  }).join("");
}

function formatActivityTimestamp(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildActivitySummary(action, field, oldValue, newValue) {
  if (action === "Created") {
    return "Lead was added to the CRM.";
  }

  if (action === "Deleted") {
    return "Lead was deleted from the CRM.";
  }

  if (!field) {
    return "Lead was updated.";
  }

  if (oldValue && newValue) {
    return `${field} changed from ${oldValue} to ${newValue}.`;
  }

  if (newValue) {
    return `${field} set to ${newValue}.`;
  }

  return `${field} was cleared.`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
