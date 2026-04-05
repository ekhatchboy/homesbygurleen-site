const state = {
  leads: [],
  filteredLeads: [],
  selectedLeadId: "",
  isSaving: false,
  quickView: "all"
};

const elements = {
  leadList: document.querySelector("#leadList"),
  detailCard: document.querySelector("#detailCard"),
  pipelineBoard: document.querySelector("#pipelineBoard"),
  searchInput: document.querySelector("#searchInput"),
  leadTypeFilter: document.querySelector("#leadTypeFilter"),
  leadStatusFilter: document.querySelector("#leadStatusFilter"),
  quickViews: document.querySelector("#quickViews"),
  refreshButton: document.querySelector("#refreshLeadsButton"),
  statusText: document.querySelector("#crmStatusText"),
  metricTotal: document.querySelector("#metricTotal"),
  metricNew: document.querySelector("#metricNew"),
  metricActive: document.querySelector("#metricActive"),
  metricDue: document.querySelector("#metricDue"),
  heroMetricTotal: document.querySelector('[data-hero-metric="total"]'),
  heroMetricNew: document.querySelector('[data-hero-metric="new"]'),
  heroMetricDue: document.querySelector('[data-hero-metric="due"]'),
  openLeadModalButton: document.querySelector("#openLeadModalButton"),
  leadModal: document.querySelector("#leadModal"),
  closeLeadModalButton: document.querySelector("#closeLeadModalButton"),
  createLeadForm: document.querySelector("#createLeadForm"),
  createLeadSubmitButton: document.querySelector("#createLeadSubmitButton")
};

initialize();

function initialize() {
  elements.searchInput?.addEventListener("input", applyFilters);
  elements.leadTypeFilter?.addEventListener("change", applyFilters);
  elements.leadStatusFilter?.addEventListener("change", applyFilters);
  elements.quickViews?.querySelectorAll("[data-quick-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.quickView = button.getAttribute("data-quick-view") || "all";
      syncQuickViewButtons();
      applyFilters();
    });
  });
  elements.refreshButton?.addEventListener("click", loadLeads);
  elements.openLeadModalButton?.addEventListener("click", openLeadModal);
  elements.closeLeadModalButton?.addEventListener("click", closeLeadModal);
  document.querySelectorAll("[data-close-lead-modal]").forEach((button) => {
    button.addEventListener("click", closeLeadModal);
  });
  elements.createLeadForm?.addEventListener("submit", handleCreateLeadSubmit);
  elements.leadModal?.addEventListener("click", (event) => {
    if (event.target === elements.leadModal) {
      closeLeadModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.leadModal?.hasAttribute("hidden")) {
      closeLeadModal();
    }
  });
  prefillCreateLeadForm();
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

    if (!matchesQuickView(lead)) {
      return false;
    }

    return true;
  });

  if (!state.filteredLeads.some((lead) => lead["Lead ID"] === state.selectedLeadId)) {
    state.selectedLeadId = state.filteredLeads[0]?.["Lead ID"] || "";
  }

  renderLeadList();
  renderPipelineBoard();
  renderSelectedLead();
  updateMetrics(state.filteredLeads);
}

function matchesQuickView(lead) {
  switch (state.quickView) {
    case "today":
      return getDueState(lead["Next Follow-Up Date"]).className === "is-today";
    case "overdue":
      return getDueState(lead["Next Follow-Up Date"]).className === "is-overdue";
    case "new":
      return lead["Lead Status"] === "New";
    case "buySell":
      return lead["Lead Type"] === "Buyer + Seller";
    default:
      return true;
  }
}

function syncQuickViewButtons() {
  elements.quickViews?.querySelectorAll("[data-quick-view]").forEach((button) => {
    const isActive = (button.getAttribute("data-quick-view") || "all") === state.quickView;
    button.classList.toggle("is-active", isActive);
  });
}

function renderLeadList() {
  if (!state.filteredLeads.length) {
    elements.leadList.innerHTML = `<div class="crm-empty-state">No leads match these filters yet.</div>`;
    return;
  }

  elements.leadList.innerHTML = state.filteredLeads.map((lead) => {
    const isActive = lead["Lead ID"] === state.selectedLeadId;
    const name = lead["Name"] || lead["Email"] || formatPhoneValue(lead["Phone"]) || "Unnamed lead";
    const dueState = getDueState(lead["Next Follow-Up Date"]);

    return `
      <button type="button" class="crm-lead-row${isActive ? " is-active" : ""}" data-lead-id="${escapeHtml(lead["Lead ID"])}">
        <h3 class="crm-lead-title">${escapeHtml(name)}</h3>
        <div class="crm-lead-subtitle">${escapeHtml(lead["Lead Type"] || "Lead")} | ${escapeHtml(lead["Source"] || "Unknown source")}</div>
        <div class="crm-lead-meta">
          ${renderPill(lead["Lead Status"], `is-${String(lead["Lead Status"] || "").toLowerCase()}`)}
          ${renderContractPills(lead)}
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
        ${renderContractPills(lead)}
        ${renderPill(lead["Text Status"] || "Pending Review")}
        ${renderPill(dueState.label, dueState.className)}
      </div>
    </div>

    <section class="crm-summary-panel">
      <div class="crm-section-heading">
        <h4>Smart Summary</h4>
        <p class="crm-detail-note">A quick read on what matters most before you reach out.</p>
      </div>
      <p class="crm-smart-summary">${escapeHtml(buildSmartSummary(lead))}</p>
    </section>

    <div class="crm-snapshot-grid">
      ${renderSnapshotCard("Follow-Up Rank", lead["Follow-Up Rank"] || "Rank A")}
      ${renderSnapshotCard("Last Contact", lead["Last Contact Date"] ? formatLongDate(lead["Last Contact Date"]) : "Not logged")}
      ${renderSnapshotCard("Next Follow-Up", lead["Next Follow-Up Date"] ? formatLongDate(lead["Next Follow-Up Date"]) : "Not set")}
      ${renderSnapshotCard("Lending Status", lead["Lending"] || "Not set")}
    </div>

    <div class="crm-detail-grid">
      ${renderDetailItem("Phone", lead["Phone"] ? formatPhoneValue(lead["Phone"]) : "Not provided")}
      ${renderDetailItem("Email", lead["Email"] || "Not provided")}
      ${renderDetailItem("Location", lead["Area"] || "Not provided")}
      ${renderDetailItem("Timeline", lead["Timeline"] || "Not provided")}
      ${renderDetailItem("Budget", lead["Budget"] ? formatBudgetValue(lead["Budget"]) : "Not provided")}
    </div>

    <section class="crm-timeline-panel">
      <div class="crm-section-heading">
        <h4>Lead History</h4>
        <p class="crm-detail-note">A quick timeline of what has happened and what needs to happen next.</p>
      </div>
      <div class="crm-timeline-list">
        ${renderTimeline(lead)}
      </div>
    </section>

    <section class="crm-action-panel">
      <div class="crm-section-heading">
        <h4>Quick Actions</h4>
        <p class="crm-detail-note">Handle the most common next steps without editing every field manually.</p>
      </div>
      <div class="crm-action-grid">
        <button type="button" class="crm-action-button" data-quick-action="contactedToday">Mark Contacted Today</button>
        <div class="crm-action-combo">
          <select class="crm-action-select" id="followUpDelaySelect" aria-label="Choose follow-up delay">
            <option value="2">Push by 2 Days</option>
            <option value="7">Push by 1 Week</option>
            <option value="14">Push by 2 Weeks</option>
            <option value="30">Push by 1 Month</option>
          </select>
          <button type="button" class="crm-action-button" data-quick-action="pushFollowUp">Update Follow-Up</button>
        </div>
        <button type="button" class="crm-action-button" data-quick-action="setWarm">Set as Warm</button>
        <button type="button" class="crm-action-button" data-quick-action="copyMessage">Copy Follow-Up Text</button>
      </div>
    </section>

    <form id="leadEditForm" class="crm-form-grid">
      ${renderInput("Name", lead["Name"])}
      ${renderSelect("Lead Type", ["Buyer", "Seller", "Buyer + Seller", "Referral", "Investor"], lead["Lead Type"] || "Buyer")}
      ${renderInput("Phone", lead["Phone"] ? formatPhoneValue(lead["Phone"]) : "")}
      ${renderInput("Email", lead["Email"])}
      ${renderInput("Area", lead["Area"])}
      ${renderInput("Timeline", lead["Timeline"])}
      ${renderInput("Budget", lead["Budget"] ? formatBudgetValue(lead["Budget"]) : "")}
      ${renderSelect("Consent to Text", ["", "Yes", "No"], lead["Consent to Text"])}
      ${renderSelect("Lead Status", ["New", "Active", "Warm", "No Answer", "Closed"], lead["Lead Status"] || "New")}
      ${renderSelect("Buyer Contract Signed", ["", "Yes", "No"], lead["Buyer Contract Signed"] || "")}
      ${renderInput("Buyer Contract Signed Date", lead["Buyer Contract Signed Date"], "date")}
      ${renderInput("Buyer Contract Expiration Date", lead["Buyer Contract Expiration Date"], "date")}
      ${renderSelect("Seller Contract Signed", ["", "Yes", "No"], lead["Seller Contract Signed"] || "")}
      ${renderInput("Seller Contract Signed Date", lead["Seller Contract Signed Date"], "date")}
      ${renderInput("Seller Contract Expiration Date", lead["Seller Contract Expiration Date"], "date")}
      ${renderInput("Last Contact Date", lead["Last Contact Date"], "date")}
      ${renderInput("Next Follow-Up Date", lead["Next Follow-Up Date"], "date")}
      ${renderSelect("Follow-Up Rank", ["Rank A", "Rank B", "Rank C"], lead["Follow-Up Rank"] || "Rank A")}
      ${renderSelect("Text Status", ["Pending Review", "Ready", "Sent", "Skipped"], lead["Text Status"] || "Pending Review")}
      ${renderSelect("Lending", ["", "In Progress", "Pre-Approved", "Not Needed"], lead["Lending"] || "")}
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

  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", () => handleQuickAction(lead, button.getAttribute("data-quick-action") || ""));
  });
}

function renderPipelineBoard() {
  if (!elements.pipelineBoard) {
    return;
  }

  const statuses = ["New", "Active", "Warm", "No Answer", "Closed"];

  elements.pipelineBoard.innerHTML = statuses.map((status) => {
    const leads = state.filteredLeads
      .filter((lead) => lead["Lead Status"] === status)
      .sort(comparePipelinePriority);
    const leadMarkup = leads.map((lead) => {
      const isSelected = lead["Lead ID"] === state.selectedLeadId;
      const dueState = getDueState(lead["Next Follow-Up Date"]);
      const displayName = lead["Name"] || lead["Email"] || formatPhoneValue(lead["Phone"]) || "Unnamed lead";

      return `
        <button type="button" class="crm-pipeline-lead${isSelected ? " is-selected" : ""}" data-pipeline-lead-id="${escapeHtml(lead["Lead ID"])}">
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml(lead["Lead Type"] || "Lead")}</span>
          ${renderPill(dueState.label, dueState.className)}
        </button>
      `;
    }).join("");

    return `
      <section class="crm-pipeline-column">
        <div class="crm-pipeline-head">
          <div>
            <span class="crm-pipeline-label">${escapeHtml(status)}</span>
            <strong>${String(leads.length)}</strong>
          </div>
          <button type="button" class="crm-pipeline-filter" data-pipeline-filter="${escapeHtml(status)}">View</button>
        </div>
        <div class="crm-pipeline-stack">
          ${leadMarkup || `<div class="crm-pipeline-empty">No ${status.toLowerCase()} leads.</div>`}
        </div>
      </section>
    `;
  }).join("");

  elements.pipelineBoard.querySelectorAll("[data-pipeline-lead-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLeadId = button.getAttribute("data-pipeline-lead-id") || "";
      renderLeadList();
      renderPipelineBoard();
      renderSelectedLead();
      elements.detailCard?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  elements.pipelineBoard.querySelectorAll("[data-pipeline-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.leadStatusFilter.value = button.getAttribute("data-pipeline-filter") || "";
      applyFilters();
    });
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
    payload[key] = key === "Phone" ? formatPhoneValue(value) : value;
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
    if (result.lead && result.lead["Lead ID"]) {
      upsertLeadInState(result.lead);
      applyFilters();
      void refreshLeadsInBackground();
    } else {
      await loadLeads();
    }
  } catch (error) {
    elements.statusText.textContent = error.message || "Unable to save lead.";
  } finally {
    state.isSaving = false;
    renderSelectedLead();
  }
}

async function handleCreateLeadSubmit(event) {
  event.preventDefault();

  if (state.isSaving || !elements.createLeadForm) {
    return;
  }

  const formData = new FormData(elements.createLeadForm);
  const payload = {
    action: "createLead"
  };

  for (const [key, value] of formData.entries()) {
    if (!String(value || "").trim()) {
      continue;
    }

    payload[key] = key === "Phone"
      ? formatPhoneValue(value)
      : key === "Budget"
        ? normalizeBudgetForSave(value)
        : value;
  }

  state.isSaving = true;
  syncCreateLeadButton();
  elements.statusText.textContent = "Adding lead to your master sheet.";

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
      throw new Error(result.error || "Unable to create lead.");
    }

    if (result.lead && result.lead["Lead ID"]) {
      upsertLeadInState(result.lead);
      closeLeadModal({ reset: true });
      applyFilters();
      elements.statusText.textContent = "Lead added successfully.";
      void refreshLeadsInBackground();
    } else {
      throw new Error("Lead was created, but no record was returned.");
    }
  } catch (error) {
    elements.statusText.textContent = error.message || "Unable to create lead.";
  } finally {
    state.isSaving = false;
    syncCreateLeadButton();
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
  if (elements.heroMetricTotal) elements.heroMetricTotal.textContent = String(total);
  if (elements.heroMetricNew) elements.heroMetricNew.textContent = String(newCount);
  if (elements.heroMetricDue) elements.heroMetricDue.textContent = String(dueCount);
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

function comparePipelinePriority(a, b) {
  const duePriority = getDuePriorityValue(a) - getDuePriorityValue(b);
  if (duePriority !== 0) {
    return duePriority;
  }

  const rankPriority = getRankPriorityValue(a["Follow-Up Rank"]) - getRankPriorityValue(b["Follow-Up Rank"]);
  if (rankPriority !== 0) {
    return rankPriority;
  }

  const nextFollowUpPriority = getFollowUpTimestamp(a["Next Follow-Up Date"]) - getFollowUpTimestamp(b["Next Follow-Up Date"]);
  if (nextFollowUpPriority !== 0) {
    return nextFollowUpPriority;
  }

  return String(a["Name"] || a["Email"] || "").localeCompare(String(b["Name"] || b["Email"] || ""));
}

function getDuePriorityValue(lead) {
  const dueClass = getDueState(lead["Next Follow-Up Date"]).className;

  if (dueClass === "is-overdue") {
    return 0;
  }

  if (dueClass === "is-today") {
    return 1;
  }

  if (dueClass === "is-tomorrow") {
    return 2;
  }

  if (lead["Next Follow-Up Date"]) {
    return 3;
  }

  return 4;
}

function getRankPriorityValue(rank) {
  switch (String(rank || "").trim()) {
    case "Rank A":
      return 0;
    case "Rank B":
      return 1;
    case "Rank C":
      return 2;
    default:
      return 3;
  }
}

function getFollowUpTimestamp(value) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return toDateOnly(date).getTime();
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

function formatLongDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function renderPill(text, className = "") {
  if (!text) {
    return "";
  }

  return `<span class="crm-pill ${className}">${escapeHtml(text)}</span>`;
}

function renderContractPills(lead) {
  const pills = [];

  if (lead["Buyer Contract Signed"] === "Yes") {
    pills.push(renderPill("Buyer Contract", "is-contract"));
  }

  if (lead["Seller Contract Signed"] === "Yes") {
    pills.push(renderPill("Seller Contract", "is-contract"));
  }

  return pills.join("");
}

function renderDetailItem(label, value) {
  return `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderSnapshotCard(label, value) {
  return `
    <article class="crm-snapshot-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderTimeline(lead) {
  const events = buildTimelineEvents(lead);

  if (!events.length) {
    return `<div class="crm-timeline-empty">No timeline events yet.</div>`;
  }

  return events.map((event) => `
    <article class="crm-timeline-item">
      <div class="crm-timeline-marker ${escapeHtml(event.tone || "")}"></div>
      <div class="crm-timeline-content">
        <span>${escapeHtml(event.dateLabel)}</span>
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(event.body)}</p>
      </div>
    </article>
  `).join("");
}

function buildTimelineEvents(lead) {
  const events = [];

  if (lead["Date"]) {
    events.push({
      dateLabel: formatLongDate(lead["Date"]),
      title: "Lead entered the CRM",
      body: `${lead["Lead Type"] || "Lead"} from ${lead["Source"] || "unknown source"} was captured.`,
      tone: "is-neutral"
    });
  }

  if (lead["Last Contact Date"]) {
    events.push({
      dateLabel: formatLongDate(lead["Last Contact Date"]),
      title: "Last contact logged",
      body: `Most recent outreach was marked on this date. Current status is ${lead["Lead Status"] || "New"}.`,
      tone: "is-complete"
    });
  }

  if (lead["Next Follow-Up Date"]) {
    const dueState = getDueState(lead["Next Follow-Up Date"]);
    events.push({
      dateLabel: formatLongDate(lead["Next Follow-Up Date"]),
      title: "Next follow-up scheduled",
      body: `${dueState.label}. Priority is ${lead["Follow-Up Rank"] || "Rank A"}.`,
      tone: dueState.className === "is-overdue" ? "is-alert" : (dueState.className === "is-today" ? "is-today" : "is-upcoming")
    });
  }

  if (lead["Latest Message / Notes"]) {
    events.push({
      dateLabel: "Latest note",
      title: "Notes on file",
      body: truncateForTimeline(lead["Latest Message / Notes"]),
      tone: "is-note"
    });
  }

  return events;
}

function truncateForTimeline(value) {
  const text = String(value || "").trim();
  if (text.length <= 160) {
    return text;
  }

  return `${text.slice(0, 157).trim()}...`;
}

function buildSmartSummary(lead) {
  const parts = [];
  const leadType = cleanValue(lead["Lead Type"]);
  const area = cleanValue(lead["Area"]);
  const timeline = cleanValue(lead["Timeline"]);
  const budget = cleanValue(lead["Budget"]);
  const goal = cleanValue(lead["Goal / Context"]);
  const notes = cleanValue(lead["Latest Message / Notes"]);
  const source = cleanValue(lead["Source"]);
  const dueState = getDueState(lead["Next Follow-Up Date"]);
  const status = cleanValue(lead["Lead Status"]);
  const rank = cleanValue(lead["Follow-Up Rank"]);
  const lending = cleanValue(lead["Lending"]);

  if (leadType) {
    parts.push(`${withArticle_(leadType)} lead`);
  } else {
    parts.push("Lead");
  }

  if (area) {
    parts.push(`focused on ${area}`);
  }

  if (timeline) {
    parts.push(`timeline: ${timeline}`);
  }

  if (budget) {
    parts.push(`budget around ${formatBudgetSummary(budget)}`);
  }

  if (goal) {
    parts.push(`context: ${truncateSentence(goal, 90)}`);
  } else if (notes) {
    parts.push(`notes: ${truncateSentence(notes, 90)}`);
  }

  if (source) {
    parts.push(`came in through ${source}`);
  }

  if (lending) {
    parts.push(`lending status: ${lending.toLowerCase()}`);
  }

  if (status) {
    parts.push(`currently marked ${status.toLowerCase()}`);
  }

  if (rank) {
    parts.push(`priority ${rank}`);
  }

  if (dueState.className === "is-overdue") {
    parts.push("follow-up is overdue");
  } else if (dueState.className === "is-today") {
    parts.push("follow-up is due today");
  } else if (lead["Next Follow-Up Date"]) {
    parts.push(`next follow-up is ${formatLongDate(lead["Next Follow-Up Date"])}`);
  }

  const summary = joinSummaryParts(parts);
  return summary || "Lead is in the CRM, but there is not enough detail yet for a smarter summary.";
}

function joinSummaryParts(parts) {
  const filtered = parts.filter(Boolean);
  if (!filtered.length) {
    return "";
  }

  const first = filtered[0];
  const rest = filtered.slice(1);
  const sentence = [capitalizeSentence(first), ...rest].join(", ");
  return `${sentence}.`;
}

function capitalizeSentence(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cleanValue(value) {
  const text = String(value || "").trim();
  return text && text.toLowerCase() !== "not provided" ? text : "";
}

function truncateSentence(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function formatBudgetSummary(value) {
  const formatted = formatBudgetValue(value);
  if (formatted && formatted !== String(value || "").trim()) {
    return formatted;
  }

  const text = String(value || "").trim();
  if (text) {
    return text;
  }

  return "";
}

function formatBudgetValue(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (!/^\$?\s*\d[\d,]*(\.\d+)?$/.test(text)) {
    return text;
  }

  const amount = Number(text.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return text;
  }

  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function normalizeBudgetForSave(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (!/^\$?\s*\d[\d,]*(\.\d+)?$/.test(text)) {
    return text;
  }

  const amount = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) ? String(Math.round(amount)) : text;
}

function formatPhoneValue(value) {
  const text = String(value || "").trim();
  const digits = text.replace(/\D/g, "");

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return text;
}

function withArticle_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  return /^[aeiou]/i.test(text) ? `an ${text}` : `a ${text}`;
}

async function handleQuickAction(lead, action) {
  if (!lead || !lead["Lead ID"]) {
    return;
  }

  if (action === "copyMessage") {
    try {
      await navigator.clipboard.writeText(String(lead["Assigned Message"] || ""));
      elements.statusText.textContent = "Follow-up message copied to clipboard.";
    } catch {
      elements.statusText.textContent = "Unable to copy follow-up message from this browser.";
    }
    return;
  }

  const payload = {
    action: "updateLead",
    leadId: lead["Lead ID"]
  };

  if (action === "contactedToday") {
    const today = toIsoDate(new Date());
    payload["Last Contact Date"] = today;
    payload["Next Follow-Up Date"] = toIsoDate(addDaysToDate(new Date(), 2));
    payload["Lead Status"] = lead["Lead Status"] === "Closed" ? "Closed" : "Active";
  }

  if (action === "pushFollowUp") {
    const delaySelect = document.querySelector("#followUpDelaySelect");
    const delayDays = Number(delaySelect?.value || 2);
    const baseDate = lead["Next Follow-Up Date"] ? new Date(lead["Next Follow-Up Date"]) : new Date();
    payload["Next Follow-Up Date"] = toIsoDate(addDaysToDate(baseDate, delayDays));
  }

  if (action === "setWarm") {
    payload["Lead Status"] = "Warm";
    payload["Follow-Up Rank"] = "Rank B";
  }

  if (Object.keys(payload).length <= 2) {
    return;
  }

  await saveLeadPatch(payload);
}

async function saveLeadPatch(payload) {
  if (state.isSaving) {
    return;
  }

  state.isSaving = true;
  renderSelectedLead();
  elements.statusText.textContent = "Saving quick action.";

  if (Object.prototype.hasOwnProperty.call(payload, "Phone")) {
    payload["Phone"] = formatPhoneValue(payload["Phone"]);
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
      throw new Error(result.error || "Unable to save quick action.");
    }

    elements.statusText.textContent = "Quick action saved.";
    if (result.lead && result.lead["Lead ID"]) {
      upsertLeadInState(result.lead);
      applyFilters();
      void refreshLeadsInBackground();
    } else {
      await loadLeads();
    }
  } catch (error) {
    elements.statusText.textContent = error.message || "Unable to save quick action.";
  } finally {
    state.isSaving = false;
    renderSelectedLead();
  }
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

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDate(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function upsertLeadInState(updatedLead) {
  const leadId = updatedLead?.["Lead ID"];
  if (!leadId) {
    return;
  }

  const index = state.leads.findIndex((lead) => lead["Lead ID"] === leadId);
  if (index === -1) {
    state.leads = [updatedLead, ...state.leads];
  } else {
    state.leads[index] = updatedLead;
    state.leads = [...state.leads];
  }

  state.selectedLeadId = leadId;
}

async function refreshLeadsInBackground() {
  try {
    const response = await fetch(`/crm/leads?ts=${Date.now()}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload.ok || !Array.isArray(payload.leads)) {
      return;
    }

    state.leads = payload.leads;
    applyFilters();
  } catch {
    // Keep the optimistic local update if the background refresh fails.
  }
}

function openLeadModal() {
  if (!elements.leadModal) {
    return;
  }

  prefillCreateLeadForm();
  elements.leadModal.hidden = false;
  document.body.style.overflow = "hidden";
  elements.createLeadForm?.querySelector('input[name="Name"]')?.focus();
}

function closeLeadModal(options = {}) {
  if (!elements.leadModal) {
    return;
  }

  elements.leadModal.hidden = true;
  document.body.style.overflow = "";

  if (options.reset) {
    prefillCreateLeadForm();
  }
}

function prefillCreateLeadForm() {
  if (!elements.createLeadForm) {
    return;
  }

  elements.createLeadForm.reset();
  const nextFollowUpInput = elements.createLeadForm.querySelector('input[name="Next Follow-Up Date"]');
  if (nextFollowUpInput) {
    nextFollowUpInput.value = toIsoDate(addDaysToDate(new Date(), 2));
  }
}

function syncCreateLeadButton() {
  if (!elements.createLeadSubmitButton) {
    return;
  }

  elements.createLeadSubmitButton.textContent = state.isSaving ? "Adding..." : "Add lead";
  elements.createLeadSubmitButton.disabled = state.isSaving;
}
