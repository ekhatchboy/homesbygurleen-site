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

  elements.activityList.innerHTML = groupChangesByLead(changes).map((group) => {
    const latestChange = group.changes[0] || {};
    const timestamp = formatActivityTimestamp(latestChange["Timestamp"]);
    const actionLabel = group.changes.length === 1
      ? String(latestChange["Action"] || "Updated").trim()
      : `${group.changes.length} updates`;

    return `
      <article class="crm-note-entry">
        <div class="crm-note-date">${escapeHtml(timestamp)}</div>
        <div>
          <strong>${escapeHtml(group.leadName)}</strong>
          <div class="crm-note-lines">
            ${renderGroupedChangesByTimestamp(group.changes)}
          </div>
        </div>
        <span>${escapeHtml(actionLabel)}</span>
      </article>
    `;
  }).join("");
}

function groupChangesByLead(changes) {
  const groupsByKey = new Map();

  changes.forEach((change) => {
    const leadId = String(change["Lead ID"] || "").trim();
    const leadName = String(change["Lead Name"] || leadId || "Lead").trim();
    const key = leadId || leadName.toLowerCase();

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        leadName,
        changes: []
      });
    }

    groupsByKey.get(key).changes.push(change);
  });

  return Array.from(groupsByKey.values());
}

function renderGroupedChangesByTimestamp(changes) {
  const groupsByTime = new Map();

  changes.forEach((change) => {
    const timestamp = formatActivityTimestamp(change["Timestamp"]);

    if (!groupsByTime.has(timestamp)) {
      groupsByTime.set(timestamp, []);
    }

    groupsByTime.get(timestamp).push(change);
  });

  return Array.from(groupsByTime.entries()).map(([timestamp, timestampChanges]) => `
    <div class="crm-note-time-group">
      <div class="crm-note-line-time">${escapeHtml(timestamp)}</div>
      <div class="crm-note-time-lines">
        ${timestampChanges.map(renderGroupedChange).join("")}
      </div>
    </div>
  `).join("");
}

function renderGroupedChange(change) {
  const action = String(change["Action"] || "Updated").trim();
  const field = String(change["Field"] || "").trim();
  const oldValue = formatChangeValue(field, change["Old Value"]);
  const newValue = formatChangeValue(field, change["New Value"]);
  const summary = buildActivitySummary(action, field, oldValue, newValue);

  return `<p>${escapeHtml(summary)}</p>`;
}

function formatChangeValue(field, value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (!/date|anniversary/i.test(field)) {
    return text;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
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
