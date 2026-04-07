const STORAGE_KEY = "hbg-property-board-v1";
const BOARD_COLUMNS = 8;
const BOARD_ROWS = 6;
const BOARD_SLOT_COUNT = BOARD_COLUMNS * BOARD_ROWS;

const state = {
  properties: [],
  selectedId: "",
  filter: "all",
  previewProperty: null,
  popupTargetId: ""
};

const elements = {
  propertyForm: document.querySelector("#propertyForm"),
  propertySubmitButton: document.querySelector("#propertySubmitButton"),
  searchPropertyButton: document.querySelector("#searchPropertyButton"),
  propertyList: document.querySelector("#propertyList"),
  propertyDetailCard: document.querySelector("#propertyDetailCard"),
  mapStatusText: document.querySelector("#mapStatusText"),
  metricTotal: document.querySelector("#mapMetricTotal"),
  metricVisited: document.querySelector("#mapMetricVisited"),
  metricUpcoming: document.querySelector("#mapMetricUpcoming"),
  propertyMap: document.querySelector("#propertyMap")
};

initialize();

function initialize() {
  loadProperties();
  elements.propertyForm?.addEventListener("submit", handlePropertySubmit);
  elements.searchPropertyButton?.addEventListener("click", handlePreview);
  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.getAttribute("data-map-filter") || "all";
      syncFilterButtons();
      render();
    });
  });
}

function loadProperties() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state.properties = raw ? JSON.parse(raw) : [];
  } catch {
    state.properties = [];
  }
  state.selectedId = state.properties.find((entry) => entry.showInList !== false)?.id || "";
  render();
}

function saveProperties() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.properties));
}

function render() {
  renderMetrics();
  renderPropertyList();
  renderBoard();
  renderPropertyDetail();
}

function renderMetrics() {
  const listed = getListedProperties();
  elements.metricTotal.textContent = String(listed.length);
  elements.metricVisited.textContent = String(listed.filter((entry) => entry.status === "visited").length);
  elements.metricUpcoming.textContent = String(listed.filter((entry) => entry.status === "upcoming").length);
}

function getListedProperties() {
  return state.properties.filter((entry) => entry.showInList !== false);
}

function getFilteredProperties() {
  const listed = getListedProperties();
  return state.filter === "all" ? listed : listed.filter((entry) => entry.status === state.filter);
}

function renderPropertyList() {
  const items = getFilteredProperties();
  if (!items.length) {
    elements.propertyList.innerHTML = `<div class="map-empty-state">No homes match this view yet.</div>`;
    return;
  }

  elements.propertyList.innerHTML = items.map((property) => `
    <div class="map-property-item${property.id === state.selectedId ? " is-selected" : ""}" data-property-id="${escapeHtml(property.id)}" role="button" tabindex="0">
      <div class="map-property-head">
        <h3 class="map-property-title">${escapeHtml(property.address)}</h3>
        <button type="button" class="map-property-remove" data-delete-list-property="${escapeHtml(property.id)}" aria-label="Remove property">-</button>
      </div>
      <p class="map-property-subtitle">${escapeHtml(property.leadName || "No lead linked yet")}</p>
      <div class="map-property-meta">
        ${renderStatusPill(property.status)}
        ${property.visitDate ? `<span class="map-status-pill">${escapeHtml(formatDate(property.visitDate))}</span>` : ""}
      </div>
    </div>
  `).join("");

  elements.propertyList.querySelectorAll("[data-property-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedId = card.getAttribute("data-property-id") || "";
      state.previewProperty = null;
      state.popupTargetId = state.selectedId;
      render();
    });
  });

  elements.propertyList.querySelectorAll("[data-delete-list-property]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteProperty(button.getAttribute("data-delete-list-property") || "");
    });
  });
}

function renderBoard() {
  const entries = [...state.properties];
  if (state.previewProperty) {
    entries.push({ ...state.previewProperty, id: "__preview__", isPreview: true });
  }

  elements.propertyMap.innerHTML = `
    <div class="board-surface">
      <div class="board-road board-road-horizontal road-top"></div>
      <div class="board-road board-road-horizontal road-mid"></div>
      <div class="board-road board-road-horizontal road-bottom"></div>
      <div class="board-road board-road-vertical road-left"></div>
      <div class="board-road board-road-vertical road-right"></div>
      <div class="board-road-label label-top">Seaport Village Drive</div>
      <div class="board-road-label label-mid">Mont Cliff Way</div>
      <div class="board-road-label label-bottom">Fairlane Drive</div>
      ${entries.map((entry) => renderBoardHouse(entry)).join("")}
      ${renderPopup(entries)}
    </div>
  `;

  elements.propertyMap.querySelectorAll("[data-board-house]").forEach((house) => {
    house.addEventListener("click", () => {
      const id = house.getAttribute("data-board-house") || "";
      state.popupTargetId = id;
      if (id === "__preview__") {
        state.selectedId = "";
      } else {
        state.selectedId = id;
        state.previewProperty = null;
      }
      render();
    });
  });

  elements.propertyMap.querySelectorAll("[data-popup-status]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPopupStatus(button.getAttribute("data-popup-status") || "upcoming");
    });
  });

  elements.propertyMap.querySelector("[data-save-popup-preview]")?.addEventListener("click", () => {
    savePreviewProperty();
  });

  elements.propertyMap.querySelector("[data-close-popup]")?.addEventListener("click", () => {
    state.popupTargetId = "";
    render();
  });
}

function renderBoardHouse(entry) {
  const position = ensureSlot(entry);
  const classes = ["board-house", `is-${entry.status || "upcoming"}`, entry.id === state.selectedId ? "is-selected" : "", entry.isPreview ? "is-preview" : ""].filter(Boolean).join(" ");
  return `
    <button type="button" class="${classes}" data-board-house="${escapeHtml(entry.id)}" style="left:${position.x}%; top:${position.y}%;">
      <span class="board-house-number">${escapeHtml(extractAddressNumber(entry.address))}</span>
    </button>
  `;
}

function renderPopup(entries) {
  const entry = entries.find((item) => item.id === state.popupTargetId);
  if (!entry) {
    return "";
  }

  const position = ensureSlot(entry);
  const popupTop = Math.max(4, position.y - 18);
  const popupLeft = Math.min(70, Math.max(4, position.x - 4));
  return `
    <div class="board-popup" style="left:${popupLeft}%; top:${popupTop}%;">
      <button type="button" class="board-popup-close" data-close-popup aria-label="Close">×</button>
      <strong>${escapeHtml(entry.address)}</strong>
      <div class="map-preview-actions">
        <button type="button" class="map-status-button${entry.status === "upcoming" ? " is-active" : ""}" data-popup-status="upcoming">Gold</button>
        <button type="button" class="map-status-button${entry.status === "visited" ? " is-active" : ""}" data-popup-status="visited">Green</button>
        <button type="button" class="map-status-button${entry.status === "under-contract" ? " is-active" : ""}" data-popup-status="under-contract">Red</button>
      </div>
      ${entry.isPreview ? `<button type="button" class="map-button map-button-primary map-popup-save" data-save-popup-preview>Save on Board</button>` : ""}
    </div>
  `;
}

function handlePreview() {
  const address = String(document.querySelector("#propertyAddress")?.value || "").trim();
  if (!address) {
    elements.mapStatusText.textContent = "Enter an address first, then preview it on the board.";
    return;
  }

  const existing = state.properties.find((entry) => entry.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    state.previewProperty = null;
    state.selectedId = existing.id;
    state.popupTargetId = existing.id;
    render();
    elements.mapStatusText.textContent = "That house is already on your board.";
    return;
  }

  state.previewProperty = {
    address,
    leadName: "",
    status: "upcoming",
    visitDate: "",
    notes: "",
    slot: findOpenSlot(address, state.properties)
  };
  state.selectedId = "";
  state.popupTargetId = "__preview__";
  render();
  elements.mapStatusText.textContent = "Previewed on the board. Pick a color and save it when ready.";
}

function handlePropertySubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.propertyForm);
  const address = String(formData.get("address") || "").trim();
  const leadName = String(formData.get("leadName") || "").trim();
  const status = String(formData.get("status") || "upcoming").trim();
  const visitDate = String(formData.get("visitDate") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const editId = elements.propertyForm.dataset.editId || "";
  if (!address) {
    return;
  }

  syncSubmitButton(true, editId ? "Saving..." : "Adding...");
  const previewSlot = state.previewProperty && state.previewProperty.address.toLowerCase() === address.toLowerCase() ? state.previewProperty.slot : null;
  const existing = editId ? state.properties.find((entry) => entry.id === editId) : null;
  if (existing) {
    existing.address = address;
    existing.leadName = leadName;
    existing.status = status;
    existing.visitDate = visitDate;
    existing.notes = notes;
    existing.showInList = true;
    existing.slot = existing.slot ?? previewSlot ?? findOpenSlot(address, state.properties, existing.id);
    state.selectedId = existing.id;
  } else {
    state.properties.unshift({ id: crypto.randomUUID(), address, leadName, status, visitDate, notes, showInList: true, slot: previewSlot ?? findOpenSlot(address, state.properties) });
    state.selectedId = state.properties[0].id;
  }

  saveProperties();
  state.previewProperty = null;
  state.popupTargetId = state.selectedId;
  elements.propertyForm.reset();
  delete elements.propertyForm.dataset.editId;
  syncSubmitButton(false, "Add property");
  render();
  elements.mapStatusText.textContent = "Property saved on your board.";
}

function savePreviewProperty() {
  if (!state.previewProperty) {
    return;
  }

  const preview = state.previewProperty;
  const existing = state.properties.find((entry) => entry.address.toLowerCase() === preview.address.toLowerCase());
  if (existing) {
    existing.status = preview.status;
    existing.slot = existing.slot ?? preview.slot;
    existing.showInList = false;
    if (preview.status === "visited" && !existing.visitDate) {
      existing.visitDate = new Date().toISOString().slice(0, 10);
    }
  } else {
    state.properties.unshift({ id: crypto.randomUUID(), address: preview.address, leadName: "", status: preview.status, visitDate: preview.status === "visited" ? new Date().toISOString().slice(0, 10) : "", notes: "", showInList: false, slot: preview.slot ?? findOpenSlot(preview.address, state.properties) });
  }

  saveProperties();
  state.previewProperty = null;
  state.popupTargetId = "";
  render();
  elements.mapStatusText.textContent = "House color saved on the board.";
}

function applyPopupStatus(status) {
  if (state.popupTargetId === "__preview__" && state.previewProperty) {
    state.previewProperty.status = status;
    render();
    elements.mapStatusText.textContent = "Preview house color updated.";
    return;
  }

  const property = state.properties.find((entry) => entry.id === state.popupTargetId);
  if (!property) {
    return;
  }

  property.status = status;
  if (status === "visited" && !property.visitDate) {
    property.visitDate = new Date().toISOString().slice(0, 10);
  }
  saveProperties();
  render();
  elements.mapStatusText.textContent = "House color updated on the board.";
}

function renderPropertyDetail() {
  const property = state.properties.find((entry) => entry.id === state.selectedId);
  if (!property) {
    if (state.previewProperty) {
      elements.propertyDetailCard.innerHTML = `
        <div class="map-card-heading">
          <div>
            <p class="map-kicker">Previewed House</p>
            <h3>${escapeHtml(state.previewProperty.address)}</h3>
          </div>
          ${renderStatusPill(state.previewProperty.status)}
        </div>
        <p class="map-detail-copy">Use the popup on the board to choose a color and save this house.</p>
      `;
      return;
    }

    elements.propertyDetailCard.innerHTML = `<div class="map-empty-state">Click a house on the board or a property in the list to open its notes.</div>`;
    return;
  }

  elements.propertyDetailCard.innerHTML = `
    <div class="map-card-heading">
      <div>
        <p class="map-kicker">Property Notes</p>
        <h3>${escapeHtml(property.address)}</h3>
      </div>
      ${renderStatusPill(property.status)}
    </div>
    <div class="map-detail-grid">
      <div class="map-detail-field">
        <span>Lead / Client</span>
        <strong>${escapeHtml(property.leadName || "Not linked yet")}</strong>
      </div>
      <div class="map-detail-field">
        <span>Visit Date</span>
        <strong>${property.visitDate ? escapeHtml(formatDate(property.visitDate)) : "Not set"}</strong>
      </div>
    </div>
    <div class="map-detail-notes">${escapeHtml(property.notes || "No notes yet.")}</div>
    <div class="map-detail-actions">
      <button type="button" class="map-button map-button-secondary" data-edit-property="${escapeHtml(property.id)}">Load into form</button>
      <button type="button" class="map-button map-button-secondary" data-delete-property="${escapeHtml(property.id)}">Delete property</button>
    </div>
  `;

  elements.propertyDetailCard.querySelector("[data-edit-property]")?.addEventListener("click", () => loadPropertyIntoForm(property));
  elements.propertyDetailCard.querySelector("[data-delete-property]")?.addEventListener("click", () => deleteProperty(property.id));
}

function loadPropertyIntoForm(property) {
  elements.propertyForm.address.value = property.address || "";
  elements.propertyForm.leadName.value = property.leadName || "";
  elements.propertyForm.status.value = property.status || "upcoming";
  elements.propertyForm.visitDate.value = property.visitDate || "";
  elements.propertyForm.notes.value = property.notes || "";
  elements.propertyForm.dataset.editId = property.id;
  syncSubmitButton(false, "Save property");
  elements.mapStatusText.textContent = "Property loaded into the form.";
}

function deleteProperty(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) {
    return;
  }

  if (!window.confirm(`Delete ${property.address} from your property board?`)) {
    return;
  }

  state.properties = state.properties.filter((entry) => entry.id !== propertyId);
  if (state.selectedId === propertyId) {
    state.selectedId = state.properties.find((entry) => entry.showInList !== false)?.id || "";
  }
  if (state.popupTargetId === propertyId) {
    state.popupTargetId = "";
  }
  saveProperties();
  render();
  elements.mapStatusText.textContent = "Property removed.";
}

function syncFilterButtons() {
  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-map-filter") === state.filter);
  });
}

function syncSubmitButton(isBusy, label) {
  elements.propertySubmitButton.disabled = isBusy;
  elements.propertySubmitButton.textContent = label;
}

function renderStatusPill(status) {
  return `<span class="map-status-pill is-${escapeHtml(status || "upcoming")}">${escapeHtml(readableStatus(status))}</span>`;
}

function readableStatus(status) {
  if (status === "visited") return "Visited";
  if (status === "under-contract") return "Under Contract";
  return "Upcoming";
}

function ensureSlot(property) {
  property.slot = property.slot ?? findOpenSlot(property.address, state.properties, property.id);
  return slotToPosition(property.slot);
}

function slotToPosition(slot) {
  const safeSlot = Number.isInteger(slot) ? slot : 0;
  const col = safeSlot % BOARD_COLUMNS;
  const row = Math.floor(safeSlot / BOARD_COLUMNS);
  return { x: 6 + col * 11.2, y: 16 + row * 12.3 };
}

function findOpenSlot(address, properties, ignoreId = "") {
  const used = new Set(properties.filter((entry) => entry.id !== ignoreId && Number.isInteger(entry.slot)).map((entry) => entry.slot));
  const start = hashString(address) % BOARD_SLOT_COUNT;
  for (let i = 0; i < BOARD_SLOT_COUNT; i += 1) {
    const candidate = (start + i) % BOARD_SLOT_COUNT;
    if (!used.has(candidate)) return candidate;
  }
  return 0;
}

function hashString(value) {
  return Array.from(String(value || "").toLowerCase()).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 7);
}

function extractAddressNumber(address) {
  const match = String(address || "").match(/^\s*(\d+[A-Za-z\-]*)/);
  return match ? match[1] : "Home";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
