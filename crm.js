const state = {
  leads: [],
  filteredLeads: [],
  selectedLeadId: "",
  isSaving: false
};

const elements = {
  leadList: document.querySelector("#leadList"),
  detailCard: document.querySelector("#detailCard"),
  searchInput: document.querySelector("#searchInput"),
  leadTypeFilter: document.querySelector("#leadTypeFilter"),
  leadStatusFilter: document.querySelector("#leadStatusFilter"),
  refreshButton: document.querySelector("#refreshLeadsButton"),
  statusText: document.querySelector("#crmStatusText"),
  metricTotal: document.querySelector("#metricTotal"),
  metricNew: document.querySelector("#metricNew"),
  metricActive: document.querySelector("#metricActive"),
  metricDue: document.querySelector("#metricDue")
};

initialize();

function initialize() {
  elements.searchInput?.addEventListener("input", applyFilters);
  elements.leadTypeFilter?.addEventListener("change", applyFilters);
  elements.leadStatusFilter?.addEventListener("change", applyFilters);
  elements.refreshButton?.addEventListener("click", loadLeads);
  loadLeads();
}

async function loadLeads() {
  elements.statusText.textContent = "Loading leads from your master sheet.";

  try {
    const response = await fetch(`/crm/leads?ts=${Date.now()}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load CRM leads.");
    }

    state.leads = Array.isArray(payload.leads) ? payload.leads : [];
    state.selectedLeadId = state.selectedLeadId || state.leads[0]?.["Lead ID"] || "";
    elements.statusText.textContent = `Loaded ${state.leads.length} lead${state.leads.length === 1 ? "" : "s"} from Google Sheets.`;
    applyFilters();
  } catch (error) {
    elements.statusText.textContent = error.message || "Unable to load CRM leads.";
    elements.leadList.innerHTML = `<div class="crm-empty-state">${escapeHtml(error.message || "Unable to load CRM leads.")}</div>`;
    elements.detailCard.innerHTML = `<div class="crm-empty-state crm-detail-empty">${escapeHtml(error.message || "Unable to load CRM leads.")}</div>`;
    updateMetrics([]);
  }
}

function applyFilters() {
  const searchValue = String(elements.searchInput?.value || "").trim().toLowerCase();
  const typeValue = String(elements.leadTypeFilter?.value || "").trim();
  const statusValue = String(elements.leadStatusFilter?.value || "").trim();

  state.filteredLeads = state.leads.filter((lead) => {
    const haystack = [
      lead["Name"],
      lead["Phone"],
      lead["Email"],
      lead["Area"],
      lead["Lead Type"],
      lead["Latest Message / Notes"]
    ].join(" ").toLowerCase();

    if (searchValue && !haystack.includes(searchValue)) {
      return false;
    }

    if (typeValue && lead["Lead Type"] !== typeValue) {
      return false;
    }

    if (statusValue && lead["Lead Status"] !== statusValue) {
      return false;
    }

    return true;
  });

  if (!state.filteredLeads.some((lead) => lead["Lead ID"] === state.selectedLeadId)) {
    state.selectedLeadId = state.filteredLeads[0]?.["Lead ID"] || "";
  }

  renderLeadList();
  renderSelectedLead();
  updateMetrics(state.filteredLeads);
}

function renderLeadList() {
  if (!state.filteredLeads.length) {
    elements.leadList.innerHTML = `<div class="crm-empty-state">No leads match these filters yet.</div>`;
    return;
  }

  elements.leadList.innerHTML = state.filteredLeads.map((lead) => {
    const isActive = lead["Lead ID"] === state.selectedLeadId;
    const name = lead["Name"] || lead["Email"] || lead["Phone"] || "Unnamed lead";
    const dueState = getDueState(lead["Next Follow-Up Date"]);

    return `
      <button type="button" class="crm-lead-row${isActive ? " is-active" : ""}" data-lead-id="${escapeHtml(lead["Lead ID"])}">
        <h3 class="crm-lead-title">${escapeHtml(name)}</h3>
        <div class="crm-lead-subtitle">${escapeHtml(lead["Lead Type"] || "Lead")} | ${escapeHtml(lead["Source"] || "Unknown source")}</div>
        <div class="crm-lead-meta">
          ${renderPill(lead["Lead Status"], `is-${String(lead["Lead Status"] || "").toLowerCase()}`)}
          ${renderPill(lead["Follow-Up Rank"] || "Rank A")}
          ${renderPill(dueState.label, dueState.className)}
        </div>
      </button>
    `;
  }).join("");

  elements.leadList.querySelectorAll("[data-lead-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeadId = button.getAttribute("data-lead-id") || "";
      renderLeadList();
      renderSelectedLead();
    });
  });
}

function renderSelectedLead() {
  const lead = state.filteredLeads.find((entry) => entry["Lead ID"] === state.selectedLeadId)
    || state.leads.find((entry) => entry["Lead ID"] === state.selectedLeadId);

  if (!lead) {
    elements.detailCard.innerHTML = `<div class="crm-empty-state crm-detail-empty">Pick a lead from the left to review notes, follow-up timing, and contact details.</div>`;
    return;
  }

  const dueState = getDueState(lead["Next Follow-Up Date"]);
  const name = lead["Name"] || "Unnamed lead";

  elements.detailCard.innerHTML = `
    <div class="crm-form-heading">
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p class="crm-detail-note">${escapeHtml(lead["Lead Type"] || "Lead")} | ${escapeHtml(lead["Source"] || "Unknown source")} | ${escapeHtml(lead["Lead ID"] || "")}</p>
      </div>
      <div class="crm-lead-meta">
        ${renderPill(lead["Lead Status"], `is-${String(lead["Lead Status"] || "").toLowerCase()}`)}
        ${renderPill(lead["Text Status"] || "Pending Review")}
        ${renderPill(dueState.label, dueState.className)}
      </div>
    </div>

    <div class="crm-detail-grid">
      ${renderDetailItem("Phone", lead["Phone"] || "Not provided")}
      ${renderDetailItem("Email", lead["Email"] || "Not provided")}
      ${renderDetailItem("Area", lead["Area"] || "Not provided")}
      ${renderDetailItem("Timeline", lead["Timeline"] || "Not provided")}
      ${renderDetailItem("Budget", lead["Budget"] || "Not provided")}
      ${renderDetailItem("Business Email", lead["Business Email"] || "Not provided")}
    </div>

    <form id="leadEditForm" class="crm-form-grid">
      ${renderInput("Name", lead["Name"])}
      ${renderSelect("Lead Type", ["Buyer", "Seller", "Buyer + Seller", "Referral", "Investor"], lead["Lead Type"] || "Buyer")}
      ${renderInput("Phone", lead["Phone"])}
      ${renderInput("Email", lead["Email"])}
      ${renderInput("Area", lead["Area"])}
      ${renderInput("Timeline", lead["Timeline"])}
      ${renderInput("Budget", lead["Budget"])}
      ${renderSelect("Consent to Text", ["", "Yes", "No"], lead["Consent to Text"])}
      ${renderSelect("Lead Status", ["New", "Active", "Warm", "Closed"], lead["Lead Status"] || "New")}
      ${renderInput("Last Contact Date", lead["Last Contact Date"], "date")}
      ${renderInput("Next Follow-Up Date", lead["Next Follow-Up Date"], "date")}
      ${renderSelect("Follow-Up Rank", ["Rank A", "Rank B", "Rank C"], lead["Follow-Up Rank"] || "Rank A")}
      ${renderSelect("Text Status", ["Pending Review", "Ready", "Sent", "Skipped"], lead["Text Status"] || "Pending Review")}
      ${renderTextarea("Goal / Context", lead["Goal / Context"], true)}
      ${renderTextarea("Latest Message / Notes", lead["Latest Message / Notes"], true)}
      ${renderTextarea("Assigned Message", lead["Assigned Message"], true)}
      <div class="crm-full crm-form-actions">
        <button type="submit" class="button button-primary">${state.isSaving ? "Saving..." : "Save lead updates"}</button>
        <button type="button" class="button button-secondary" id="copyTranscriptButton">Copy transcript</button>
      </div>
    </form>
    <p class="crm-inline-note">Transcript / raw responses are preserved in Google Sheets so you always have the original lead context.</p>
  `;

  document.querySelector("#leadEditForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveLead(lead["Lead ID"], new FormData(event.currentTarget));
  });

  document.querySelector("#copyTranscriptButton")?.addEventListener("click", async () => {
    const transcript = lead["Transcript / Raw Responses"] || "";
    try {
      await navigator.clipboard.writeText(transcript);
      elements.statusText.textContent = "Transcript copied to clipboard.";
    } catch {
      elements.statusText.textContent = "Unable to copy transcript from this browser.";
    }
  });
}

async function saveLead(leadId, formData) {
  if (!leadId || state.isSaving) {
    return;
  }

  state.isSaving = true;
  renderSelectedLead();
  elements.statusText.textContent = "Saving lead updates.";

  const payload = {
    action: "updateLead",
    leadId
  };

  for (const [key, value] of formData.entries()) {
    payload[key] = value;
  }

  try {
    const response = await fetch("/crm/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Unable to save lead.");
    }

    elements.statusText.textContent = "Lead saved successfully.";
    await loadLeads();
  } catch (error) {
    elements.statusText.textContent = error.message || "Unable to save lead.";
  } finally {
    state.isSaving = false;
    renderSelectedLead();
  }
}

function updateMetrics(leads) {
  const total = leads.length;
  const newCount = leads.filter((lead) => lead["Lead Status"] === "New").length;
  const activeCount = leads.filter((lead) => lead["Lead Status"] === "Active").length;
  const dueCount = leads.filter((lead) => {
    const dueState = getDueState(lead["Next Follow-Up Date"]);
    return dueState.className === "is-today" || dueState.className === "is-overdue";
  }).length;

  elements.metricTotal.textContent = String(total);
  elements.metricNew.textContent = String(newCount);
  elements.metricActive.textContent = String(activeCount);
  elements.metricDue.textContent = String(dueCount);
}

function getDueState(dateValue) {
  if (!dateValue) {
    return { label: "No follow-up date", className: "" };
  }

  const today = toDateOnly(new Date());
  const date = toDateOnly(new Date(dateValue));

  if (Number.isNaN(date.getTime())) {
    return { label: "Follow-up set", className: "" };
  }

  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return { label: "Overdue", className: "is-overdue" };
  }

  if (diffDays === 0) {
    return { label: "Due today", className: "is-today" };
  }

  if (diffDays === 1) {
    return { label: "Due tomorrow", className: "is-upcoming" };
  }

  return { label: `Due ${formatShortDate(dateValue)}`, className: "" };
}

function toDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatShortDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "soon";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function renderPill(text, className = "") {
  if (!text) {
    return "";
  }

  return `<span class="crm-pill ${className}">${escapeHtml(text)}</span>`;
}

function renderDetailItem(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderInput(label, value = "", type = "text") {
  const normalizedValue = type === "date" ? normalizeDateInputValue(value) : (value || "");
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(label)}" type="${escapeHtml(type)}" value="${escapeAttribute(normalizedValue)}">
    </label>
  `;
}

function renderSelect(label, options, selectedValue) {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <select name="${escapeHtml(label)}">
        ${options.map((option) => `
          <option value="${escapeAttribute(option)}"${option === selectedValue ? " selected" : ""}>${escapeHtml(option || "Blank")}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function renderTextarea(label, value = "", fullWidth = false) {
  return `
    <label class="${fullWidth ? "crm-full" : ""}">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeHtml(label)}">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", "&#10;");
}

function normalizeDateInputValue(value) {
  if (!value) {
    return "";
  }

  const stringValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const date = new Date(stringValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
