const STORAGE_KEY = "hbg-property-map-v1";

const state = {
  properties: [],
  selectedId: "",
  filter: "all",
  map: null,
  markerLayer: null,
  previewMarker: null,
  previewPopup: null,
  previewProperty: null,
  buildingLayer: null,
  selectedBuildingLayer: null,
  buildingFetchToken: 0,
  suppressMapClickUntil: 0
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
  state.map = L.map("propertyMap", { zoomControl: true }).setView([37.3869, -120.7235], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.buildingLayer = L.layerGroup().addTo(state.map);
  state.map.on("moveend zoomend", () => {
    loadBuildingFootprints();
  });
  state.map.on("click", handleMapClickPreview);
  loadBuildingFootprints();
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
  const listedProperties = state.properties.filter((entry) => entry.showInList !== false);
  elements.metricTotal.textContent = String(listedProperties.length);
  elements.metricVisited.textContent = String(listedProperties.filter((entry) => entry.status === "visited").length);
  elements.metricUpcoming.textContent = String(listedProperties.filter((entry) => entry.status === "upcoming").length);
}

function getFilteredProperties() {
  const listedProperties = state.properties.filter((entry) => entry.showInList !== false);
  return state.filter === "all" ? listedProperties : listedProperties.filter((entry) => entry.status === state.filter);
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
    if (typeof property.lat !== "number" || typeof property.lng !== "number") {
      return;
    }

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
      state.selectedId = property.id;
      state.previewProperty = null;
      renderPropertyDetail();
    });
  });

  refreshBuildingStyles();
}

async function loadBuildingFootprints() {
  if (!state.map || !state.buildingLayer) {
    return;
  }

  const zoom = state.map.getZoom();
  state.buildingLayer.clearLayers();
  state.selectedBuildingLayer = null;

  if (zoom < 17) {
    return;
  }

  const bounds = state.map.getBounds();
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const token = ++state.buildingFetchToken;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: `
[out:json][timeout:20];
(
  way["building"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
      `.trim()
    });

    if (!response.ok || token !== state.buildingFetchToken) {
      return;
    }

    const data = await response.json();
    if (token !== state.buildingFetchToken) {
      return;
    }

    const nodeMap = new Map();
    (data.elements || []).forEach((element) => {
      if (element.type === "node") {
        nodeMap.set(element.id, [element.lat, element.lon]);
      }
    });

    (data.elements || []).forEach((element) => {
      if (element.type !== "way" || !Array.isArray(element.nodes)) {
        return;
      }

      const latLngs = element.nodes
        .map((nodeId) => nodeMap.get(nodeId))
        .filter(Boolean);

      if (latLngs.length < 3) {
        return;
      }

      const polygon = L.polygon(latLngs, {
        color: "rgba(138, 75, 58, 0.18)",
        weight: 1,
        fillColor: "rgba(138, 75, 58, 0.08)",
        fillOpacity: 0.22
      });
      polygon.__buildingKey = String(element.id || `${latLngs[0][0]}:${latLngs[0][1]}`);
      polygon.__centroid = getPolygonCentroid(latLngs);

      polygon.on("click", async () => {
        state.suppressMapClickUntil = Date.now() + 400;
        await handleBuildingClick(latLngs, polygon);
      });

      polygon.addTo(state.buildingLayer);
    });
    refreshBuildingStyles();
  } catch {
    // Ignore footprint fetch failures quietly; the saved marker workflow still works.
  }
}

async function handleBuildingClick(latLngs, polygon) {
  highlightBuilding(polygon);

  const centroid = getPolygonCentroid(latLngs);
  if (!centroid) {
    return;
  }

  elements.mapStatusText.textContent = "Looking up that house so you can add it.";

  try {
    const address = await reverseGeocodeLatLng(centroid.lat, centroid.lng);
    document.querySelector("#propertyAddress").value = address;
    state.map.setView([centroid.lat, centroid.lng], 17, { animate: true });
    elements.mapStatusText.textContent = "House selected on the map. Add details and save it when you're ready.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "I couldn't identify that house yet.";
  }
}

async function handleMapClickPreview(event) {
  if (!event?.latlng) {
    return;
  }

  if (Date.now() < state.suppressMapClickUntil) {
    return;
  }

  elements.mapStatusText.textContent = "Checking the nearest address on the map.";

  try {
    const address = await reverseGeocodeLatLng(event.latlng.lat, event.latlng.lng);
    document.querySelector("#propertyAddress").value = address;
    elements.mapStatusText.textContent = "Address selected from the map. Save it when you're ready.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "I couldn't identify that spot on the map.";
  }
}

function highlightBuilding(polygon) {
  state.selectedBuildingLayer = polygon;
  refreshBuildingStyles();
}

function renderPropertyDetail() {
  const property = state.properties.find((entry) => entry.id === state.selectedId);
  if (!property) {
    if (state.previewProperty) {
      const preview = state.previewProperty;
      elements.propertyDetailCard.innerHTML = `
        <div class="map-card-heading">
          <div>
            <p class="map-kicker">Previewed House</p>
            <h3>${escapeHtml(preview.address)}</h3>
          </div>
          ${renderStatusPill(preview.status)}
        </div>
        <p class="map-detail-copy">Choose the color/status you want, then save it directly onto the map.</p>
        <div class="map-preview-actions">
          <button type="button" class="map-status-button${preview.status === "upcoming" ? " is-active" : ""}" data-preview-status="upcoming">Upcoming</button>
          <button type="button" class="map-status-button${preview.status === "visited" ? " is-active" : ""}" data-preview-status="visited">Visited</button>
          <button type="button" class="map-status-button${preview.status === "under-contract" ? " is-active" : ""}" data-preview-status="under-contract">Under Contract</button>
        </div>
        <div class="map-detail-actions">
          <button type="button" class="map-button map-button-primary" data-save-preview>Save House to Map</button>
          <button type="button" class="map-button map-button-secondary" data-load-preview>Load into form</button>
        </div>
      `;

      elements.propertyDetailCard.querySelectorAll("[data-preview-status]").forEach((button) => {
        button.addEventListener("click", () => {
          setPreviewStatus(button.getAttribute("data-preview-status") || "upcoming");
        });
      });
      elements.propertyDetailCard.querySelector("[data-save-preview]")?.addEventListener("click", savePreviewProperty);
      elements.propertyDetailCard.querySelector("[data-load-preview]")?.addEventListener("click", () => loadPreviewIntoForm());
      return;
    }

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
    const normalizedAddress = await reverseGeocodeLatLng(location.lat, location.lng).catch(() => address);
    document.querySelector("#propertyAddress").value = normalizedAddress;
    state.map.setView([location.lat, location.lng], 17, { animate: true });
    elements.mapStatusText.textContent = "Address found on the Livingston map.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to preview that address right now.";
  } finally {
    syncSearchButton(false);
  }
}

async function geocodeAddress(address) {
  const query = /livingston/i.test(address) ? address : `${address}, Livingston, CA`;
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&viewbox=-120.77,37.41,-120.67,37.34&bounded=1&q=${encodeURIComponent(query)}`, {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error("Map lookup could not reach the address service.");
  const results = await response.json();
  const match = Array.isArray(results) ? results[0] : null;
  if (!match) throw new Error("I could not place that address on the map. Try a fuller address.");
  return { lat: Number(match.lat), lng: Number(match.lon) };
}

async function reverseGeocodeLatLng(lat, lng) {
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error("Unable to look up that house on the map.");
  }

  const result = await response.json();
  const address = String(result.display_name || "").trim();

  if (!address) {
    throw new Error("I couldn't find a full address for that house.");
  }

  return address;
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
  state.map.setView([property.lat, property.lng], 17, { animate: true });
  refreshBuildingStyles();
}

function showPreviewMarker(location, address) {
  clearPreviewMarker();
  const matchedBuilding = findNearestBuildingLayer(location.lat, location.lng);
  if (matchedBuilding) {
    state.selectedBuildingLayer = matchedBuilding;
  }
  state.previewProperty = {
    address,
    lat: Number(location.lat),
    lng: Number(location.lng),
    status: "upcoming",
    buildingKey: matchedBuilding?.__buildingKey || ""
  };
  state.map.setView([location.lat, location.lng], 17, { animate: true });
  state.selectedId = "";
  renderPropertyDetail();
  refreshBuildingStyles();
  openPreviewPopup();
}

function clearPreviewMarker() {
  if (state.previewPopup) {
    state.previewPopup.remove();
  }
  state.map?.closePopup();
  state.previewMarker = null;
  state.previewPopup = null;
  state.previewProperty = null;
  refreshBuildingStyles();
}

function setPreviewStatus(status) {
  if (!state.previewProperty) {
    return;
  }

  state.previewProperty.status = status || "upcoming";
  renderPropertyDetail();
  refreshBuildingStyles();
  elements.mapStatusText.textContent = "Preview house color updated.";
}

function savePreviewProperty() {
  if (!state.previewProperty) {
    return;
  }

  const preview = state.previewProperty;
  const existing = state.properties.find((entry) => isBuildingMatch(state.selectedBuildingLayer, entry) || isLocationMatch(preview, entry));
  if (existing) {
    existing.address = preview.address;
    existing.status = preview.status;
    existing.lat = preview.lat;
    existing.lng = preview.lng;
    existing.buildingKey = preview.buildingKey || existing.buildingKey || "";
    existing.showInList = false;
    if (preview.status === "visited" && !existing.visitDate) {
      existing.visitDate = new Date().toISOString().slice(0, 10);
    }
  } else {
    state.properties.unshift({
      id: crypto.randomUUID(),
      address: preview.address,
      leadName: "",
      status: preview.status,
      visitDate: preview.status === "visited" ? new Date().toISOString().slice(0, 10) : "",
      notes: "",
      lat: preview.lat,
      lng: preview.lng,
      buildingKey: preview.buildingKey || "",
      showInList: false
    });
  }

  state.selectedId = "";
  saveProperties();
  if (state.previewPopup) {
    state.previewPopup.remove();
  }
  state.map?.closePopup();
  clearPreviewMarker();
  render();
  refreshBuildingStyles();
  elements.mapStatusText.textContent = "House color saved on the map.";
}

function loadPreviewIntoForm() {
  if (!state.previewProperty) {
    return;
  }

  elements.propertyForm.address.value = state.previewProperty.address || "";
  elements.propertyForm.leadName.value = "";
  elements.propertyForm.status.value = state.previewProperty.status || "upcoming";
  elements.propertyForm.visitDate.value = state.previewProperty.status === "visited" ? new Date().toISOString().slice(0, 10) : "";
  elements.propertyForm.notes.value = "";
  delete elements.propertyForm.dataset.editId;
  syncSubmitButton(false, "Add property");
  elements.mapStatusText.textContent = "Preview house loaded into the form.";
  document.querySelector("#propertyAddress")?.focus();
}

function openPreviewPopup() {
  if (!state.previewProperty || !state.map) {
    return;
  }

  const preview = state.previewProperty;
  const content = `
    <div class="map-preview-popup">
      <strong>${escapeHtml(preview.address)}</strong>
      <div class="map-preview-actions">
        <button type="button" class="map-status-button${preview.status === "upcoming" ? " is-active" : ""}" data-popup-preview-status="upcoming">Gold</button>
        <button type="button" class="map-status-button${preview.status === "visited" ? " is-active" : ""}" data-popup-preview-status="visited">Green</button>
        <button type="button" class="map-status-button${preview.status === "under-contract" ? " is-active" : ""}" data-popup-preview-status="under-contract">Red</button>
      </div>
      <button type="button" class="map-button map-button-primary map-popup-save" data-popup-save-preview>Save on Map</button>
    </div>
  `;

  const popup = L.popup({
    closeButton: true,
    autoClose: false,
    closeOnClick: false,
    className: "map-preview-leaflet-popup"
  })
    .setLatLng([preview.lat, preview.lng])
    .setContent(content);

  state.previewPopup = popup;
  popup.openOn(state.map);

  window.requestAnimationFrame(() => {
    const popupElement = popup.getElement();
    const popupRoot = popupElement?.querySelector(".map-preview-popup");
    if (!popupRoot) {
      return;
    }

    popupRoot.querySelectorAll("[data-popup-preview-status]").forEach((button) => {
      button.addEventListener("click", () => {
        setPreviewStatus(button.getAttribute("data-popup-preview-status") || "upcoming");
        openPreviewPopup();
      });
    });

    popupRoot.querySelector("[data-popup-save-preview]")?.addEventListener("click", () => {
      savePreviewProperty();
    });
  });
}

function refreshBuildingStyles() {
  if (!state.buildingLayer) {
    return;
  }

  state.buildingLayer.eachLayer((layer) => {
    if (!layer.__centroid) {
      return;
    }

    const previewMatch = isBuildingMatch(layer, state.previewProperty);
    const propertyMatch = state.properties.find((entry) => isBuildingMatch(layer, entry));
    const activeStatus = previewMatch ? state.previewProperty?.status : propertyMatch?.status;
    const isSelected = layer === state.selectedBuildingLayer || Boolean(propertyMatch && propertyMatch.id === state.selectedId);
    layer.setStyle(getBuildingStyle(activeStatus, isSelected));
  });
}

function getBuildingStyle(status, isSelected) {
  const palette = {
    upcoming: {
      color: "rgba(205, 168, 83, 0.96)",
      fillColor: "rgba(205, 168, 83, 0.72)"
    },
    visited: {
      color: "rgba(102, 147, 95, 0.96)",
      fillColor: "rgba(102, 147, 95, 0.72)"
    },
    "under-contract": {
      color: "rgba(190, 86, 86, 0.98)",
      fillColor: "rgba(190, 86, 86, 0.74)"
    }
  };

  const colors = palette[status] || {
    color: "rgba(138, 75, 58, 0.18)",
    fillColor: "rgba(138, 75, 58, 0.08)"
  };

  return {
    color: colors.color,
    weight: isSelected ? 2.8 : 1.6,
    fillColor: colors.fillColor,
    fillOpacity: status ? (isSelected ? 0.92 : 0.78) : (isSelected ? 0.42 : 0.22)
  };
}

function isLocationMatch(centroid, entry) {
  if (!centroid || !entry || typeof entry.lat !== "number" || typeof entry.lng !== "number") {
    return false;
  }

  return Math.abs(centroid.lat - entry.lat) <= 0.00045 && Math.abs(centroid.lng - entry.lng) <= 0.00045;
}

function isBuildingMatch(layer, entry) {
  if (!layer || !entry) {
    return false;
  }

  if (entry.buildingKey && layer.__buildingKey) {
    return entry.buildingKey === layer.__buildingKey;
  }

  return isLocationMatch(layer.__centroid, entry);
}

function findNearestBuildingLayer(lat, lng) {
  if (!state.buildingLayer) {
    return null;
  }

  let closest = null;
  let closestDistance = Infinity;

  state.buildingLayer.eachLayer((layer) => {
    if (!layer.__centroid) {
      return;
    }

    const distance = Math.hypot(layer.__centroid.lat - lat, layer.__centroid.lng - lng);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = layer;
    }
  });

  return closestDistance <= 0.0008 ? closest : null;
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

function getPolygonCentroid(latLngs) {
  if (!Array.isArray(latLngs) || !latLngs.length) {
    return null;
  }

  const totals = latLngs.reduce((acc, [lat, lng]) => {
    acc.lat += Number(lat);
    acc.lng += Number(lng);
    return acc;
  }, { lat: 0, lng: 0 });

  return {
    lat: totals.lat / latLngs.length,
    lng: totals.lng / latLngs.length
  };
}
