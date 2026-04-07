const STORAGE_KEY = "hbg-property-map-v1";
const state = { properties: [], selectedId: "", filter: "all", map: null, markerLayer: null, previewMarker: null };
const elements = {
  propertyForm: document.querySelector("#propertyForm"),
  propertySubmitButton: document.querySelector("#propertySubmitButton"),
  searchPropertyButton: document.querySelector("#searchPropertyButton"),
  propertyList: document.querySelector("#propertyList"),
  propertyDetailCard: document.querySelector("#propertyDetailCard"),
  mapStatusText: document.querySelector("#mapStatusText"),
  metricTotal: document.querySelector("#mapMetricTotal"),
  metricVisited: document.querySelector("#mapMetricVisited"),
  metricUpcoming: document.querySelector("#mapMetricUpcoming")
};

initialize();

function initialize() {
  initializeMap();
  loadProperties();
  elements.propertyForm?.addEventListener("submit", handlePropertySubmit);
  elements.searchPropertyButton?.addEventListener("click", handlePropertySearch);
  document.querySelectorAll("[data-map-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.getAttribute("data-map-filter") || "all";
      syncFilterButtons();
      render();
    });
  });
}

function initializeMap() {
  state.map = L.map("propertyMap", { zoomControl: true }).setView([37.3022, -120.4829], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
}

function loadProperties() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state.properties = raw ? JSON.parse(raw) : [];
  } catch {
    state.properties = [];
  }
  state.selectedId = state.properties[0]?.id || "";
  render();
}

function saveProperties() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.properties));
}

function render() {
  renderMetrics();
  renderPropertyList();
  renderMapMarkers();
  renderPropertyDetail();
}

function renderMetrics() {
  elements.metricTotal.textContent = String(state.properties.length);
  elements.metricVisited.textContent = String(state.properties.filter((entry) => entry.status === "visited").length);
  elements.metricUpcoming.textContent = String(state.properties.filter((entry) => entry.status === "upcoming").length);
}

function getFilteredProperties() {
  return state.filter === "all" ? state.properties : state.properties.filter((entry) => entry.status === state.filter);
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
  elements.propertyList.querySelectorAll("[data-property-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.getAttribute("data-property-id") || "";
      render();
      focusSelectedMarker();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedId = button.getAttribute("data-property-id") || "";
        render();
        focusSelectedMarker();
      }
    });
  });
  elements.propertyList.querySelectorAll("[data-delete-list-property]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteProperty(button.getAttribute("data-delete-list-property") || "");
    });
  });
}

function renderMapMarkers() {
  state.markerLayer.clearLayers();
  const visible = getFilteredProperties();
  visible.forEach((property) => {
    if (typeof property.lat !== "number" || typeof property.lng !== "number") return;
    const icon = L.divIcon({
      className: "",
      html: renderMarkerIcon(property),
      iconSize: [34, 40],
      iconAnchor: [17, 34],
      popupAnchor: [0, -26]
    });
    const marker = L.marker([property.lat, property.lng], { icon }).addTo(state.markerLayer);
    marker.bindPopup(`<strong>${escapeHtml(property.address)}</strong><br>${escapeHtml(property.leadName || "No lead linked yet")}<br>${escapeHtml(readableStatus(property.status))}`);
    marker.on("click", () => {
      if (state.selectedId === property.id) {
        togglePropertyVisitStatus(property.id);
        return;
      }

      state.selectedId = property.id;
      renderPropertyList();
      renderPropertyDetail();
    });
  });
  const withCoords = visible.filter((entry) => typeof entry.lat === "number" && typeof entry.lng === "number");
  if (withCoords.length === 1) {
    state.map.setView([withCoords[0].lat, withCoords[0].lng], 14);
  } else if (withCoords.length > 1) {
    state.map.fitBounds(L.latLngBounds(withCoords.map((entry) => [entry.lat, entry.lng])).pad(0.22));
  }
}

function renderPropertyDetail() {
  const property = state.properties.find((entry) => entry.id === state.selectedId);
  if (!property) {
    elements.propertyDetailCard.innerHTML = `<div class="map-empty-state">Click a house pin or a property in the list to open its notes.</div>`;
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
      <button type="button" class="map-button map-button-secondary" data-open-map="${escapeHtml(property.id)}">Open map</button>
      <button type="button" class="map-button map-button-secondary" data-delete-property="${escapeHtml(property.id)}">Delete property</button>
    </div>
  `;
  document.querySelector("[data-edit-property]")?.addEventListener("click", () => loadPropertyIntoForm(property));
  document.querySelector("[data-open-map]")?.addEventListener("click", () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`, "_blank");
  });
  document.querySelector("[data-delete-property]")?.addEventListener("click", () => deleteProperty(property.id));
}

function renderStatusPill(status) {
  return `<span class="map-status-pill ${escapeHtml(status || "upcoming")}">${escapeHtml(readableStatus(status))}</span>`;
}

function renderMarkerIcon(property) {
  const statusClass = escapeHtml(property.status || "upcoming");
  const selectedClass = property.id === state.selectedId ? " is-selected" : "";

  return `
    <div class="property-marker-house ${statusClass}${selectedClass}">
      <span class="property-marker-roof"></span>
      <span class="property-marker-body"></span>
      <span class="property-marker-door"></span>
      <span class="property-marker-chimney"></span>
    </div>
  `;
}

function readableStatus(status) {
  if (status === "visited") return "Visited";
  if (status === "under-contract") return "Under Contract";
  return "Upcoming";
}

async function handlePropertySubmit(event) {
  event.preventDefault();
  const formData = new FormData(elements.propertyForm);
  const address = String(formData.get("address") || "").trim();
  const leadName = String(formData.get("leadName") || "").trim();
  const status = String(formData.get("status") || "upcoming").trim();
  const visitDate = String(formData.get("visitDate") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const editId = elements.propertyForm.dataset.editId || "";
  if (!address) return;
  syncSubmitButton(true, editId ? "Saving..." : "Adding...");
  elements.mapStatusText.textContent = "Finding that address on the map.";
  try {
    const existing = editId ? state.properties.find((entry) => entry.id === editId) : null;
    const location = existing && existing.address === address ? { lat: existing.lat, lng: existing.lng } : await geocodeAddress(address);
    if (existing) {
      existing.address = address;
      existing.leadName = leadName;
      existing.status = status;
      existing.visitDate = visitDate;
      existing.notes = notes;
      existing.lat = location.lat;
      existing.lng = location.lng;
      state.selectedId = existing.id;
      elements.mapStatusText.textContent = "Property updated.";
    } else {
      const property = { id: crypto.randomUUID(), address, leadName, status, visitDate, notes, lat: location.lat, lng: location.lng };
      state.properties.unshift(property);
      state.selectedId = property.id;
      elements.mapStatusText.textContent = "Property added to your map.";
    }
    saveProperties();
    clearPreviewMarker();
    elements.propertyForm.reset();
    delete elements.propertyForm.dataset.editId;
    syncSubmitButton(false, "Add property");
    render();
    focusSelectedMarker();
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to map that address right now.";
    syncSubmitButton(false, editId ? "Save property" : "Add property");
  }
}

async function handlePropertySearch() {
  const address = String(document.querySelector("#propertyAddress")?.value || "").trim();
  if (!address) {
    elements.mapStatusText.textContent = "Enter an address first, then search it on the map.";
    return;
  }
  syncSearchButton(true);
  elements.mapStatusText.textContent = "Searching that address on the map.";
  try {
    const location = await geocodeAddress(address);
    showPreviewMarker(location, address);
    elements.mapStatusText.textContent = "Address previewed on the map. Save it when you're ready.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to preview that address right now.";
  } finally {
    syncSearchButton(false);
  }
}

async function geocodeAddress(address) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`, { headers: { "Accept": "application/json" } });
  if (!response.ok) throw new Error("Map lookup could not reach the address service.");
  const results = await response.json();
  const match = Array.isArray(results) ? results[0] : null;
  if (!match) throw new Error("I could not place that address on the map. Try a fuller address.");
  return { lat: Number(match.lat), lng: Number(match.lon) };
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
  document.querySelector("#propertyAddress")?.focus();
}

function deleteProperty(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) return;
  if (!window.confirm(`Delete ${property.address} from your property map?`)) return;
  state.properties = state.properties.filter((entry) => entry.id !== propertyId);
  if (state.selectedId === propertyId) state.selectedId = state.properties[0]?.id || "";
  saveProperties();
  render();
  elements.mapStatusText.textContent = "Property removed.";
}

function togglePropertyVisitStatus(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) return;

  if (property.status === "under-contract") {
    elements.mapStatusText.textContent = "Under-contract homes stay red. Change that from the form if needed.";
    return;
  }

  property.status = property.status === "visited" ? "upcoming" : "visited";
  if (property.status === "visited" && !property.visitDate) {
    property.visitDate = new Date().toISOString().slice(0, 10);
  }

  saveProperties();
  render();
  focusSelectedMarker();
  elements.mapStatusText.textContent = property.status === "visited"
    ? "Marked as visited from the map."
    : "Marked as upcoming from the map.";
}

function focusSelectedMarker() {
  const property = state.properties.find((entry) => entry.id === state.selectedId);
  if (!property || typeof property.lat !== "number" || typeof property.lng !== "number") return;
  state.map.setView([property.lat, property.lng], 15, { animate: true });
}

function showPreviewMarker(location, address) {
  clearPreviewMarker();
  const icon = L.divIcon({
    className: "",
    html: renderMarkerIcon({ id: "preview", status: "preview" }),
    iconSize: [34, 40],
    iconAnchor: [17, 34],
    popupAnchor: [0, -26]
  });
  state.previewMarker = L.marker([location.lat, location.lng], { icon }).addTo(state.map);
  state.previewMarker.bindPopup(`<strong>${escapeHtml(address)}</strong><br>Preview only`).openPopup();
  state.map.setView([location.lat, location.lng], 15, { animate: true });
}

function clearPreviewMarker() {
  if (!state.previewMarker) return;
  state.map.removeLayer(state.previewMarker);
  state.previewMarker = null;
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

function syncSearchButton(isBusy) {
  if (!elements.searchPropertyButton) return;
  elements.searchPropertyButton.disabled = isBusy;
  elements.searchPropertyButton.textContent = isBusy ? "Searching..." : "Search on Map";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
