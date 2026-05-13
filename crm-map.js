const STORAGE_KEY = "hbg-property-map-v1";

const state = {
  properties: [],
  selectedId: "",
  selectedPropertySnapshot: null,
  filter: "all",
  map: null,
  markerLayer: null,
  savedShapeLayer: null,
  previewMarker: null,
  previewPopup: null,
  previewProperty: null,
  buildingLayer: null,
  selectedBuildingLayer: null,
  buildingFetchToken: 0,
  suppressMapClickUntil: 0,
  buildingReloadTimer: null,
  lastBuildingFetchKey: "",
  addressSuggestTimer: null,
  addressSuggestToken: 0
};

const elements = {
  propertyForm: document.querySelector("#propertyForm"),
  propertyAddress: document.querySelector("#propertyAddress"),
  propertySubmitButton: document.querySelector("#propertySubmitButton"),
  searchPropertyButton: document.querySelector("#searchPropertyButton"),
  propertyList: document.querySelector("#propertyList"),
  propertyDetailCard: document.querySelector("#propertyDetailCard"),
  mapStatusText: document.querySelector("#mapStatusText"),
  mapSuggestions: document.querySelector("#mapSuggestions"),
  mapHoverReadout: document.querySelector("#mapHoverReadout"),
  metricTotal: document.querySelector("#mapMetricTotal"),
  metricVisited: document.querySelector("#mapMetricVisited"),
  metricUpcoming: document.querySelector("#mapMetricUpcoming")
};

initialize();

function initialize() {
  initializeMap();
  loadProperties();
  elements.propertyForm?.addEventListener("submit", handlePropertySubmit);
  elements.propertyAddress?.addEventListener("keydown", handlePropertyAddressKeydown);
  elements.propertyAddress?.addEventListener("input", handlePropertyAddressInput);
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
  state.map = L.map("propertyMap", { zoomControl: true }).setView([37.25, -119.75], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  state.buildingLayer = L.layerGroup().addTo(state.map);
  state.savedShapeLayer = L.layerGroup().addTo(state.map);
  state.map.on("moveend zoomend", scheduleBuildingReload_);
  state.map.on("click", handleMapClickPreview);
  scheduleBuildingReload_(0);
}

async function loadProperties() {
  const remoteProperties = await loadPropertiesFromSheet_();
  if (remoteProperties) {
    state.properties = remoteProperties;
    state.selectedId = state.properties[0]?.id || "";
    render();
    return;
  }

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

async function loadPropertiesFromSheet_() {
  try {
    const response = await fetch(`/crm/map-homes?ts=${Date.now()}`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok || !Array.isArray(payload.homes)) {
      return null;
    }

    return payload.homes.map(mapHomeRecordToProperty_);
  } catch {
    return null;
  }
}

async function savePropertyToSheet_(property) {
  const response = await fetch("/crm/map-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "upsertMapHome",
      propertyId: property.id,
      address: property.address,
      leadName: property.leadName,
      status: property.status,
      visitDate: property.visitDate,
        notes: property.notes,
        lat: property.lat,
        lng: property.lng,
        buildingKey: property.buildingKey,
        shapePoints: property.shapePoints || "",
        showInList: property.showInList !== false
      })
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok || !payload.home) {
    throw new Error(payload?.error || "Unable to save home.");
  }

  return mapHomeRecordToProperty_(payload.home);
}

async function deletePropertyFromSheet_(propertyId) {
  const response = await fetch("/crm/map-update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "deleteMapHome",
      propertyId
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Unable to delete home.");
  }
}

function mapHomeRecordToProperty_(record) {
  return {
    id: String(record["Property ID"] || record.propertyId || crypto.randomUUID()),
    address: String(record["Address"] || record.address || "").trim(),
    leadName: String(record["Lead / Client"] || record.leadName || "").trim(),
    status: String(record["Status"] || record.status || "upcoming").trim() || "upcoming",
    visitDate: String(record["Visit Date"] || record.visitDate || "").trim(),
      notes: String(record["Notes"] || record.notes || "").trim(),
      lat: Number(record["Latitude"] || record.lat || "") || 0,
      lng: Number(record["Longitude"] || record.lng || "") || 0,
      buildingKey: String(record["Building Key"] || record.buildingKey || "").trim(),
      shapePoints: String(record["Shape Points"] || record.shapePoints || "").trim(),
      showInList: String(record["Show In List"] || record.showInList || "Yes").trim().toLowerCase() !== "no"
    };
  }

function render() {
  renderMetrics();
  renderPropertyList();
  renderSavedShapes();
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
      const propertyId = button.getAttribute("data-property-id") || "";
      state.selectedId = propertyId;
      state.selectedPropertySnapshot = state.properties.find((entry) => entry.id === propertyId) || null;
      render();
      focusSelectedMarker();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const propertyId = button.getAttribute("data-property-id") || "";
        state.selectedId = propertyId;
        state.selectedPropertySnapshot = state.properties.find((entry) => entry.id === propertyId) || null;
        render();
        focusSelectedMarker();
      }
    });
  });

  elements.propertyList.querySelectorAll("[data-delete-list-property]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteProperty(button.getAttribute("data-delete-list-property") || "");
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
    marker.on("click", (event) => {
      if (event?.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }

      state.suppressMapClickUntil = Date.now() + 500;
      state.selectedPropertySnapshot = property;
      void openSavedPropertyFromMap_(property, null, {
        refresh: false,
        latlng: event?.latlng || { lat: property.lat, lng: property.lng }
      });
      elements.mapStatusText.textContent = "Saved property opened.";
    });
  });

  refreshBuildingStyles();
}

function renderSavedShapes() {
  if (!state.savedShapeLayer) {
    return;
  }

  state.savedShapeLayer.clearLayers();

  state.properties.forEach((property) => {
    const latLngs = parseShapePoints_(property.shapePoints);
    if (!latLngs.length) {
      return;
    }

    const polygon = L.polygon(latLngs, {
      ...getSavedShapeStyle_(property.status),
      bubblingMouseEvents: false,
      interactive: true
    });
    const openSavedShape = (event) => {
      if (event?.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }

      state.suppressMapClickUntil = Date.now() + 500;
      state.selectedPropertySnapshot = property;
      void openSavedPropertyFromMap_(property, polygon, { refresh: false, latlng: event?.latlng });
      elements.mapStatusText.textContent = "Saved property opened.";
    };
    polygon.on("click", openSavedShape);
    polygon.on("mousedown", openSavedShape);
    polygon.on("mouseover", () => {
      if (elements.mapHoverReadout) {
        elements.mapHoverReadout.textContent = `${property.address} is ${readableStatus(property.status)}.`;
      }
    });
    polygon.on("mouseout", () => {
      if (elements.mapHoverReadout) {
        elements.mapHoverReadout.textContent = "Hover a saved house shape to see its current color and status.";
      }
    });
    polygon.addTo(state.savedShapeLayer);
  });

  bringLayerGroupToFront_(state.savedShapeLayer);
  bringLayerGroupToFront_(state.markerLayer);
}

async function loadBuildingFootprints() {
  if (!state.map || !state.buildingLayer) {
    return;
  }

  const zoom = state.map.getZoom();
  if (zoom < 17) {
    state.lastBuildingFetchKey = "";
    state.buildingLayer.clearLayers();
    state.selectedBuildingLayer = null;
    return;
  }

  const bounds = state.map.getBounds();
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const fetchKey = [
    zoom,
    south.toFixed(4),
    west.toFixed(4),
    north.toFixed(4),
    east.toFixed(4)
  ].join("|");

  if (fetchKey === state.lastBuildingFetchKey) {
    return;
  }

  state.lastBuildingFetchKey = fetchKey;
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

    const nextLayer = L.layerGroup();

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

      polygon.addTo(nextLayer);
    });

    state.buildingLayer.clearLayers();
    nextLayer.eachLayer((layer) => {
      layer.addTo(state.buildingLayer);
    });
    refreshBuildingStyles();
    bringLayerGroupToFront_(state.savedShapeLayer);
    bringLayerGroupToFront_(state.markerLayer);
  } catch {
    // Ignore footprint fetch failures quietly; the saved marker workflow still works.
  }
}

function scheduleBuildingReload_(delay = 220) {
  if (state.buildingReloadTimer) {
    window.clearTimeout(state.buildingReloadTimer);
  }

  state.buildingReloadTimer = window.setTimeout(() => {
    state.buildingReloadTimer = null;
    void loadBuildingFootprints();
  }, delay);
}

async function handleBuildingClick(latLngs, polygon) {
  highlightBuilding(polygon);

  const centroid = getPolygonCentroid(latLngs);
  if (!centroid) {
    return;
  }

  const existingProperty = await findSavedPropertyForBuilding_(polygon, centroid);
  if (existingProperty) {
    state.selectedPropertySnapshot = existingProperty;
    await openSavedPropertyFromMap_(existingProperty, polygon, { refresh: false, latlng: centroid });
    elements.mapStatusText.textContent = "Saved property opened.";
    return;
  }

  elements.mapStatusText.textContent = "Looking up that house so you can color it on the map.";

  try {
      const address = await reverseGeocodeLatLng(centroid.lat, centroid.lng);
      await showPreviewMarker(centroid, address, polygon);
      elements.mapStatusText.textContent = "House selected. Choose a color and save it on the map.";
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

  const savedProperty = await findSavedPropertyAtLatLng_(event.latlng);
  if (savedProperty) {
    state.suppressMapClickUntil = Date.now() + 500;
    state.selectedPropertySnapshot = savedProperty;
    await openSavedPropertyFromMap_(savedProperty, null, { refresh: false, latlng: event.latlng });
    elements.mapStatusText.textContent = "Saved property opened.";
    return;
  }

  elements.mapStatusText.textContent = "Checking the nearest address on the map.";

  try {
    const address = await reverseGeocodeLatLng(event.latlng.lat, event.latlng.lng);
    const matched = await showPreviewMarker(event.latlng, address);
    elements.mapStatusText.textContent = matched
      ? "House selected. Choose a color and save it on the map."
      : "I found the address, but not the exact house shape. Click directly on a house footprint to color it.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "I couldn't identify that spot on the map.";
  }
}

function highlightBuilding(polygon) {
  state.selectedBuildingLayer = polygon;
  refreshBuildingStyles();
}

function renderPropertyDetail() {
  const property = state.selectedPropertySnapshot?.id === state.selectedId
    ? state.selectedPropertySnapshot
    : state.properties.find((entry) => entry.id === state.selectedId);
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
          <button type="button" class="map-status-button${preview.status === "under-contract" ? " is-active" : ""}" data-preview-status="under-contract">Gold: Under Contract</button>
          <button type="button" class="map-status-button${preview.status === "visited" ? " is-active" : ""}" data-preview-status="visited">Green: Visited</button>
          <button type="button" class="map-status-button${preview.status === "do-not-go" ? " is-active" : ""}" data-preview-status="do-not-go">Red: Do Not Go</button>
        </div>
        <label class="map-preview-notes">
          <span>Notes</span>
          <textarea data-preview-notes placeholder="Anything to remember about this house.">${escapeHtml(preview.notes || "")}</textarea>
        </label>
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
      elements.propertyDetailCard.querySelector("[data-preview-notes]")?.addEventListener("input", (event) => {
        if (state.previewProperty) {
          state.previewProperty.notes = event.target.value || "";
        }
      });
      elements.propertyDetailCard.querySelector("[data-save-preview]")?.addEventListener("click", () => {
        void savePreviewProperty();
      });
      elements.propertyDetailCard.querySelector("[data-load-preview]")?.addEventListener("click", () => loadPreviewIntoForm());
      return;
    }

    elements.propertyDetailCard.innerHTML = `<div class="map-empty-state">Click a house pin or a property in the list to open its notes.</div>`;
    state.selectedPropertySnapshot = null;
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
      <div class="map-detail-field map-detail-status-field">
        <span>Map Color / Status</span>
        <strong>${escapeHtml(readableStatus(property.status))}</strong>
      </div>
      <div class="map-detail-field">
        <span>Lead / Client</span>
        <strong>${escapeHtml(property.leadName || "Not linked yet")}</strong>
      </div>
      <div class="map-detail-field">
        <span>Visit Date</span>
        <strong>${property.visitDate ? escapeHtml(formatDate(property.visitDate)) : "Not set"}</strong>
      </div>
    </div>
    ${renderSavedStatusControls_(property)}
    <div class="map-detail-notes">${escapeHtml(property.notes || "No notes yet.")}</div>
    <label class="map-detail-note-composer">
      <span>New Note</span>
      <textarea data-property-note-input placeholder="Add a new note for this property."></textarea>
    </label>
    <div class="map-detail-actions">
      <button type="button" class="map-button map-button-primary" data-save-property-note="${escapeHtml(property.id)}">Save note</button>
      <button type="button" class="map-button map-button-secondary" data-edit-property="${escapeHtml(property.id)}">Load into form</button>
      <button type="button" class="map-button map-button-secondary" data-clear-color="${escapeHtml(property.id)}">Clear color</button>
      <button type="button" class="map-button map-button-secondary" data-open-map="${escapeHtml(property.id)}">Open map</button>
      <button type="button" class="map-button map-button-secondary" data-delete-property="${escapeHtml(property.id)}">Delete property</button>
    </div>
  `;

  document.querySelector("[data-save-property-note]")?.addEventListener("click", () => {
    void savePropertyDetailNote(property.id);
  });
  attachSavedStatusControlHandlers_(property.id);
  document.querySelector("[data-edit-property]")?.addEventListener("click", () => loadPropertyIntoForm(property));
  document.querySelector("[data-clear-color]")?.addEventListener("click", () => {
    void clearPropertyColor(property.id);
  });
  document.querySelector("[data-open-map]")?.addEventListener("click", () => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`, "_blank");
  });
  document.querySelector("[data-delete-property]")?.addEventListener("click", () => {
    void deleteProperty(property.id);
  });
}

function renderSavedStatusControls_(property) {
  return `
    <div class="map-saved-status-controls">
      <span>Change Color</span>
      <div class="map-preview-actions">
        <button type="button" class="map-status-button${property.status === "under-contract" ? " is-active" : ""}" data-property-status="under-contract">Gold: Under Contract</button>
        <button type="button" class="map-status-button${property.status === "visited" ? " is-active" : ""}" data-property-status="visited">Green: Visited</button>
        <button type="button" class="map-status-button${property.status === "do-not-go" ? " is-active" : ""}" data-property-status="do-not-go">Red: Do Not Go</button>
      </div>
    </div>
  `;
}

function attachSavedStatusControlHandlers_(propertyId, root = document) {
  root.querySelectorAll("[data-property-status]").forEach((button) => {
    button.addEventListener("click", () => {
      void updateSavedPropertyStatus_(propertyId, button.getAttribute("data-property-status") || "visited");
    });
  });
}

async function updateSavedPropertyStatus_(propertyId, status) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) {
    elements.mapStatusText.textContent = "I couldn't find that saved property yet.";
    return;
  }

  property.status = status || "visited";
  if (property.status === "visited" && !property.visitDate) {
    property.visitDate = new Date().toISOString().slice(0, 10);
  }

  elements.mapStatusText.textContent = "Updating house color...";

  try {
    const savedProperty = await savePropertyToSheet_(property);
    Object.assign(property, savedProperty);
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to update that house color right now.";
    return;
  }

  state.selectedId = property.id;
  state.selectedPropertySnapshot = property;
  saveProperties();
  render();
  refreshBuildingStyles();
  openSavedPropertyPopup_(property);
  elements.mapStatusText.textContent = "House color updated.";
}

async function savePropertyDetailNote(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  const input = document.querySelector("[data-property-note-input]");
  const note = String(input?.value || "").trim();

  if (!property || !note) {
    elements.mapStatusText.textContent = "Write a note first, then save it.";
    return;
  }

  property.notes = appendUniqueNote_(property.notes, note);
  elements.mapStatusText.textContent = "Saving property note...";

  try {
    const savedProperty = await savePropertyToSheet_(property);
    Object.assign(property, savedProperty);
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to save that note right now.";
    return;
  }

  state.selectedId = property.id;
  state.selectedPropertySnapshot = property;
  saveProperties();
  render();
  elements.mapStatusText.textContent = "Note saved.";
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
    if (!status) return "Not Set";
    if (status === "visited") return "Visited";
    if (status === "under-contract") return "Under Contract";
    if (status === "do-not-go") return "Do Not Go There";
    return "Upcoming";
  }

function handlePropertyAddressKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
  void handlePropertySearch();
}

function handlePropertyAddressInput(event) {
  const query = String(event?.target?.value || "").trim();

  if (state.addressSuggestTimer) {
    window.clearTimeout(state.addressSuggestTimer);
  }

  state.addressSuggestToken += 1;

  if (query.length < 3) {
    renderAddressSuggestions([]);
    return;
  }

  const requestToken = state.addressSuggestToken;
  state.addressSuggestTimer = window.setTimeout(() => {
    void loadLiveAddressSuggestions_(query, requestToken);
  }, 120);
}

async function loadLiveAddressSuggestions_(query, requestToken) {
  const currentQuery = String(elements.propertyAddress?.value || "").trim();
  if (!currentQuery || currentQuery !== query || requestToken !== state.addressSuggestToken) {
    return;
  }

  try {
    const suggestions = await getLiveAddressSuggestions_(query, 5);
    if (requestToken !== state.addressSuggestToken) {
      return;
    }

    const refreshedQuery = String(elements.propertyAddress?.value || "").trim();
    if (refreshedQuery !== query) {
      return;
    }

    renderAddressSuggestions(suggestions, {
      copy: suggestions.length ? "Suggested places and addresses as you type" : ""
    });
  } catch {
    if (requestToken === state.addressSuggestToken) {
      renderAddressSuggestions([]);
    }
  }
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
      existing.showInList = true;
      existing.buildingKey = existing.buildingKey || "";
      existing.shapePoints = existing.shapePoints || "";
      const savedProperty = await savePropertyToSheet_(existing);
      Object.assign(existing, savedProperty);
      state.selectedId = existing.id;
      elements.mapStatusText.textContent = "Property updated.";
    } else {
      const property = {
        id: crypto.randomUUID(),
        address,
        leadName,
        status,
        visitDate,
        notes,
        lat: location.lat,
        lng: location.lng,
        buildingKey: "",
        shapePoints: "",
        showInList: true
      };
      const savedProperty = await savePropertyToSheet_(property);
      state.properties.unshift(savedProperty);
      state.selectedId = savedProperty.id;
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
    renderAddressSuggestions([]);
    return;
  }

  syncSearchButton(true);
  elements.mapStatusText.textContent = "Searching that place or address on the map.";
  renderAddressSuggestions([]);

  try {
    const location = await geocodeAddress(address);
    const normalizedAddress = await reverseGeocodeLatLng(location.lat, location.lng).catch(() => address);
    state.map.setView([location.lat, location.lng], 17, { animate: true });
    await waitForMapIdle_();
    await showPreviewMarker(location, normalizedAddress);
    elements.mapStatusText.textContent = "Location found on the California map. Choose a color and save it on the map.";
  } catch (error) {
    const suggestions = await getAddressSuggestions(address);
    if (suggestions.length) {
      elements.mapStatusText.textContent = "I couldn't place that exact search, but I found a few likely matches below.";
      renderAddressSuggestions(suggestions, { copy: "Did you mean one of these?" });
    } else {
      elements.mapStatusText.textContent = error.message || "Unable to preview that address right now.";
    }
  } finally {
    syncSearchButton(false);
  }
}

async function geocodeAddress(address) {
  const suggestions = await getAddressSuggestions(address, 1);
  const match = suggestions[0];
  if (match) {
    return { lat: match.lat, lng: match.lng };
  }

  throw new Error("I could not place that search on the map. Try a fuller address, city, or business name.");
}

async function getAddressSuggestions(address, limit = 5) {
  const baseQuery = String(address || "").trim();
  if (!baseQuery) {
    return [];
  }

  const californiaQuery = /california|,\s*ca\b/i.test(baseQuery) ? baseQuery : `${baseQuery}, CA`;
  const candidates = [];
  const seen = new Set();

  const addCandidate = (label, lat, lng) => {
    const normalizedLabel = String(label || "").trim();
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!normalizedLabel || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const key = `${normalizedLabel.toLowerCase()}|${latitude.toFixed(6)}|${longitude.toFixed(6)}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      label: normalizedLabel,
      lat: latitude,
      lng: longitude
    });
  };

  try {
    const arcGisSuggestions = await fetchArcGisAddressSuggestions_(baseQuery, Math.max(limit, 5));
    arcGisSuggestions.forEach((entry) => {
      addCandidate(entry.label, entry.lat, entry.lng);
    });

    if (candidates.length >= limit) {
      return candidates.slice(0, limit);
    }
  } catch {
    // Fall through to the other geocoders.
  }

  const nominatimQueries = [
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=${Math.max(limit, 5)}&addressdetails=1&viewbox=-124.48,42.05,-114.13,32.45&bounded=1&q=${encodeURIComponent(californiaQuery)}`,
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=${Math.max(limit, 5)}&addressdetails=1&state=California&q=${encodeURIComponent(californiaQuery)}`,
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=${Math.max(limit, 5)}&addressdetails=1&q=${encodeURIComponent(californiaQuery)}`,
    `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&limit=${Math.max(limit, 5)}&addressdetails=1&q=${encodeURIComponent(baseQuery)}`
  ];

  for (const url of nominatimQueries) {
    try {
      const response = await fetch(url, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        continue;
      }

      const results = await response.json();
      if (Array.isArray(results)) {
        results.forEach((result) => {
          addCandidate(result.display_name, result.lat, result.lon);
        });
      }

      if (candidates.length >= limit) {
        return candidates.slice(0, limit);
      }
    } catch {
      // Try the next address service.
    }
  }

  const censusQueries = [
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(californiaQuery)}&benchmark=Public_AR_Current&format=json`,
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(baseQuery)}&benchmark=Public_AR_Current&format=json`
  ];

  for (const url of censusQueries) {
    try {
      const response = await fetch(url, {
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      const matches = Array.isArray(payload?.result?.addressMatches) ? payload.result.addressMatches : [];
      matches.forEach((match) => {
        addCandidate(match.matchedAddress, match?.coordinates?.y, match?.coordinates?.x);
      });

      if (candidates.length >= limit) {
        return candidates.slice(0, limit);
      }
    } catch {
      // Try the next address service.
    }
  }

  return candidates.slice(0, limit);
}

async function getLiveAddressSuggestions_(query, limit = 5) {
  const baseQuery = String(query || "").trim();
  if (!baseQuery) {
    return [];
  }

  try {
    const quickSuggestions = await fetchArcGisAddressSuggestions_(baseQuery, Math.max(limit, 5), false);
    if (quickSuggestions.length) {
      return quickSuggestions.slice(0, limit);
    }
  } catch {
    // Fall back to the regular resolved search path.
  }

  return getAddressSuggestions(baseQuery, limit);
}

async function fetchArcGisAddressSuggestions_(query, limit, resolveLocations = true) {
  const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?f=pjson&maxSuggestions=${Math.max(limit, 5)}&countryCode=USA&searchExtent=-124.48,32.45,-114.13,42.05&location=-119.75,37.25&text=${encodeURIComponent(query)}`, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error("ArcGIS suggest failed.");
  }

  const payload = await response.json();
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  const resolved = [];

  if (!resolveLocations) {
    return suggestions
      .filter((suggestion) => suggestion && !suggestion.isCollection && suggestion.magicKey)
      .slice(0, limit)
      .map((suggestion) => ({
        label: String(suggestion.text || "").trim(),
        magicKey: String(suggestion.magicKey || "").trim(),
        provider: "arcgis"
      }))
      .filter((suggestion) => suggestion.label && suggestion.magicKey);
  }

  for (const suggestion of suggestions) {
    if (resolved.length >= limit) {
      break;
    }

    if (!suggestion || suggestion.isCollection || !suggestion.magicKey) {
      continue;
    }

    const match = await resolveArcGisSuggestion_(String(suggestion.text || "").trim(), String(suggestion.magicKey || "").trim());
    if (!match) {
      continue;
    }

    resolved.push(match);
  }

  return resolved;
}

async function resolveArcGisSuggestion_(text, magicKey) {
  if (!text || !magicKey) {
    return null;
  }

  const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=pjson&outFields=Match_addr,Addr_type,PlaceName&maxLocations=1&countryCode=USA&searchExtent=-124.48,32.45,-114.13,42.05&location=-119.75,37.25&singleLine=${encodeURIComponent(text)}&magicKey=${encodeURIComponent(magicKey)}`, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  if (!candidate) {
    return null;
  }

  const label = String(candidate.address || candidate.attributes?.Match_addr || text).trim();
  const lat = Number(candidate.location?.y);
  const lng = Number(candidate.location?.x);

  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { label, lat, lng };
}

function renderAddressSuggestions(suggestions, options = {}) {
  if (!elements.mapSuggestions) {
    return;
  }

  const items = Array.isArray(suggestions) ? suggestions.slice(0, 5) : [];
  const copy = String(options.copy || "Did you mean one of these?").trim();
  if (!items.length) {
    elements.mapSuggestions.hidden = true;
    elements.mapSuggestions.innerHTML = "";
    return;
  }

  elements.mapSuggestions.hidden = false;
  elements.mapSuggestions.innerHTML = `
    <p class="map-suggestion-copy">${escapeHtml(copy)}</p>
    ${items.map((item, index) => `
      <button
        type="button"
        class="map-suggestion-button"
        data-suggestion-index="${index}"
      >${escapeHtml(item.label)}</button>
    `).join("")}
  `;

  elements.mapSuggestions.querySelectorAll("[data-suggestion-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = items[Number(button.getAttribute("data-suggestion-index") || "-1")];
      if (!selected) {
        return;
      }

      void applyAddressSuggestion(selected);
    });
  });
}

async function applyAddressSuggestion(suggestion) {
  const chosen = suggestion || {};
  const chosenAddress = String(chosen.label || "").trim();
  if (chosenAddress) {
    document.querySelector("#propertyAddress").value = chosenAddress;
  }

  syncSearchButton(true);
  elements.mapStatusText.textContent = "Opening that suggested address on the map.";

  try {
    let lat = Number(chosen.lat);
    let lng = Number(chosen.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const resolved = await resolveSuggestedAddress_(chosen);
      lat = Number(resolved?.lat);
      lng = Number(resolved?.lng);
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("I couldn't place that suggested address on the map yet.");
    }

    state.map.setView([lat, lng], 17, { animate: true });
    await waitForMapIdle_();
    const resolvedAddress = await reverseGeocodeLatLng(lat, lng).catch(() => chosenAddress);
    await showPreviewMarker({ lat, lng }, resolvedAddress);
    renderAddressSuggestions([]);
    elements.mapStatusText.textContent = "Suggested address loaded. Choose a color and save it on the map.";
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "I couldn't open that suggested address on the map.";
  } finally {
    syncSearchButton(false);
  }
}

async function resolveSuggestedAddress_(suggestion) {
  const chosen = suggestion || {};
  const label = String(chosen.label || "").trim();
  const magicKey = String(chosen.magicKey || "").trim();

  if (magicKey) {
    const resolved = await resolveArcGisSuggestion_(label, magicKey);
    if (resolved) {
      return resolved;
    }
  }

  if (label) {
    return geocodeAddress(label);
  }

  return null;
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

async function deleteProperty(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) return;
  if (!window.confirm(`Delete ${property.address} from your property map?`)) return;
  try {
    await deletePropertyFromSheet_(propertyId);
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to delete property.";
    return;
  }
  state.properties = state.properties.filter((entry) => entry.id !== propertyId);
  if (state.selectedId === propertyId) state.selectedId = state.properties[0]?.id || "";
  saveProperties();
  render();
  elements.mapStatusText.textContent = "Property removed.";
}

async function clearPropertyColor(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) {
    return;
  }

  property.shapePoints = "";
  property.buildingKey = "";

  try {
    const savedProperty = await savePropertyToSheet_(property);
    Object.assign(property, savedProperty);
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to clear house color.";
    return;
  }

  state.selectedBuildingLayer = null;
  clearPreviewMarker();
  render();
  elements.mapStatusText.textContent = "House color cleared from the map.";
}

function togglePropertyVisitStatus(propertyId) {
  const property = state.properties.find((entry) => entry.id === propertyId);
  if (!property) return;

  if (property.status === "under-contract" || property.status === "do-not-go") {
    elements.mapStatusText.textContent = `${readableStatus(property.status)} homes should be changed from the form if needed.`;
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

async function showPreviewMarker(location, address, preferredBuilding) {
  clearPreviewMarker();
  const matchedBuilding = preferredBuilding || await ensureNearestBuildingLayer(location.lat, location.lng);
  if (!matchedBuilding) {
    document.querySelector("#propertyAddress").value = address;
    state.selectedBuildingLayer = null;
    return false;
  }

  const existingProperty = await findSavedPropertyForBuilding_(matchedBuilding, location);
  if (existingProperty) {
    await openSavedPropertyFromMap_(existingProperty, matchedBuilding, { refresh: false });
    return true;
  }

  state.selectedBuildingLayer = matchedBuilding;
  state.previewProperty = {
      address,
      lat: Number(location.lat),
      lng: Number(location.lng),
      status: "",
      notes: "",
      buildingKey: matchedBuilding?.__buildingKey || "",
      shapePoints: matchedBuilding ? serializeShapePoints_(matchedBuilding) : ""
    };
  document.querySelector("#propertyAddress").value = address;
  state.selectedId = "";
  renderPropertyDetail();
  refreshBuildingStyles();
  openPreviewPopup();
  return true;
}

function clearPreviewMarker() {
  if (state.previewPopup && state.map) {
    state.map.closePopup(state.previewPopup);
    state.previewPopup.remove();
  } else {
    state.map?.closePopup();
  }
  state.previewMarker = null;
  state.previewPopup = null;
  state.previewProperty = null;
  state.selectedPropertySnapshot = state.properties.find((entry) => entry.id === state.selectedId) || state.selectedPropertySnapshot;
  refreshBuildingStyles();
}

function setPreviewStatus(status) {
  if (!state.previewProperty) {
    return;
  }

  syncVisiblePreviewNoteDraft_();
  state.previewProperty.status = status || "upcoming";
  renderPropertyDetail();
  refreshBuildingStyles();
  elements.mapStatusText.textContent = "Preview house color updated.";
}

async function savePreviewProperty() {
  if (!state.previewProperty) {
    return;
  }

  syncVisiblePreviewInputs_();

  if (state.previewPopup && state.map) {
    state.map.closePopup(state.previewPopup);
    state.previewPopup.remove();
    state.previewPopup = null;
  }

  const preview = state.previewProperty;
  if (!preview.shapePoints) {
      elements.mapStatusText.textContent = "I didn't lock onto a house shape yet. Click directly on a house footprint, then save again.";
      return;
  }

  let savedProperty = null;

  try {
    const existing = findMatchingPropertyForPreview_();
    const previewNote = String(preview.notes || "").trim();
    if (existing) {
      existing.address = preview.address;
      existing.status = preview.status;
      existing.lat = preview.lat;
      existing.lng = preview.lng;
      existing.buildingKey = preview.buildingKey || existing.buildingKey || "";
      existing.shapePoints = preview.shapePoints || existing.shapePoints || "";
      existing.notes = appendUniqueNote_(existing.notes, previewNote);
      existing.showInList = false;
      if (preview.status === "visited" && !existing.visitDate) {
        existing.visitDate = new Date().toISOString().slice(0, 10);
      }
      savedProperty = existing;
      openSavedPropertyDetail_(savedProperty);
      const savedExisting = await savePropertyToSheet_(existing);
      Object.assign(existing, savedExisting);
    } else {
      savedProperty = {
        id: crypto.randomUUID(),
        address: preview.address,
        leadName: "",
        status: preview.status,
        visitDate: preview.status === "visited" ? new Date().toISOString().slice(0, 10) : "",
        notes: previewNote,
        lat: preview.lat,
        lng: preview.lng,
        buildingKey: preview.buildingKey || "",
        shapePoints: preview.shapePoints || "",
        showInList: false
      };
      state.properties.unshift(savedProperty);
      openSavedPropertyDetail_(savedProperty);
      const savedFromSheet = await savePropertyToSheet_(savedProperty);
      Object.assign(savedProperty, savedFromSheet);
    }
  } catch (error) {
    elements.mapStatusText.textContent = error.message || "Unable to save house color right now.";
    return;
  }

  if (!savedProperty?.id) {
    elements.mapStatusText.textContent = "House color saved, but I could not reopen its detail card yet.";
    return;
  }

  openSavedPropertyDetail_(savedProperty);
  refreshBuildingStyles();
  elements.mapStatusText.textContent = "House color saved on the map.";
}

function openSavedPropertyDetail_(property) {
  if (!property?.id) {
    return;
  }

  saveProperties();
  if (!(state.previewPopup && state.map)) {
    state.map?.closePopup();
  }
  clearPreviewMarker();
  state.selectedId = property.id;
  render();
}

function syncVisiblePreviewInputs_() {
  if (!state.previewProperty) {
    return;
  }

  syncVisiblePreviewNoteDraft_();
  const activeStatusButton = document.querySelector("[data-preview-status].is-active, [data-popup-preview-status].is-active");

  if (activeStatusButton) {
    state.previewProperty.status =
      activeStatusButton.getAttribute("data-preview-status") ||
      activeStatusButton.getAttribute("data-popup-preview-status") ||
      state.previewProperty.status;
  }
}

function syncVisiblePreviewNoteDraft_() {
  if (!state.previewProperty) {
    return;
  }

  const visibleNote = document.querySelector("[data-preview-notes]");
  const sidebarNote = document.querySelector("#propertyNotes");
  if (visibleNote && String(visibleNote.value || "").trim()) {
    state.previewProperty.notes = visibleNote.value || "";
    return;
  }

  if (sidebarNote && String(sidebarNote.value || "").trim()) {
    state.previewProperty.notes = sidebarNote.value || "";
  }
}

function appendUniqueNote_(existingNotes, nextNote) {
  const current = String(existingNotes || "").trim();
  const incoming = String(nextNote || "").trim();

  if (!incoming) {
    return current;
  }

  if (!current) {
    return incoming;
  }

  if (current.split(/\n{2,}/).some((entry) => entry.trim() === incoming)) {
    return current;
  }

  return `${current}\n\n${incoming}`;
}

function loadPreviewIntoForm() {
  if (!state.previewProperty) {
    return;
  }

  elements.propertyForm.address.value = state.previewProperty.address || "";
  elements.propertyForm.leadName.value = "";
  elements.propertyForm.status.value = state.previewProperty.status || "upcoming";
  elements.propertyForm.visitDate.value = state.previewProperty.status === "visited" ? new Date().toISOString().slice(0, 10) : "";
  elements.propertyForm.notes.value = state.previewProperty.notes || "";
  delete elements.propertyForm.dataset.editId;
  syncSubmitButton(false, "Add property");
  elements.mapStatusText.textContent = "Preview house loaded into the form.";
  document.querySelector("#propertyAddress")?.focus();
}

function openPreviewPopup() {
  if (!state.previewProperty || !state.map) {
    return;
  }

  if (state.previewPopup) {
    state.map.closePopup(state.previewPopup);
    state.previewPopup.remove();
    state.previewPopup = null;
  }

  const preview = state.previewProperty;
  const content = `
    <div class="map-preview-popup">
      <strong>${escapeHtml(preview.address)}</strong>
        <div class="map-preview-actions">
          <button type="button" class="map-status-button${preview.status === "under-contract" ? " is-active" : ""}" data-popup-preview-status="under-contract">Gold: Under Contract</button>
          <button type="button" class="map-status-button${preview.status === "visited" ? " is-active" : ""}" data-popup-preview-status="visited">Green: Visited</button>
          <button type="button" class="map-status-button${preview.status === "do-not-go" ? " is-active" : ""}" data-popup-preview-status="do-not-go">Red: Do Not Go</button>
          <button type="button" class="map-status-button" data-popup-clear-preview>Clear</button>
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

    popupRoot.querySelector("[data-popup-clear-preview]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!state.previewProperty) {
        elements.mapStatusText.textContent = "No house preview is active to clear.";
        return;
      }

      const existing = findMatchingPropertyForPreview_();

      if (existing) {
        elements.mapStatusText.textContent = "Clearing house color...";
        await clearPropertyColor(existing.id);
      } else {
        state.selectedBuildingLayer = null;
        clearPreviewMarker();
        render();
        elements.mapStatusText.textContent = "Preview color cleared.";
      }
    });

    popupRoot.querySelector("[data-popup-save-preview]")?.addEventListener("click", () => {
      void savePreviewProperty();
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

    const previewMatch = Boolean(state.previewProperty && layer === state.selectedBuildingLayer);
    const propertyMatch = state.properties.find((entry) => isBuildingMatch(layer, entry));
    const activeStatus = previewMatch ? state.previewProperty?.status : propertyMatch?.status;
    const isSelected = layer === state.selectedBuildingLayer || Boolean(propertyMatch && propertyMatch.id === state.selectedId);
    layer.setStyle(getBuildingStyle(activeStatus, isSelected));
  });
}

function getBuildingStyle(status, isSelected) {
  const palette = {
    upcoming: {
      color: "rgba(153, 131, 114, 0.8)",
      fillColor: "rgba(153, 131, 114, 0.38)"
    },
    visited: {
      color: "rgba(102, 147, 95, 0.96)",
      fillColor: "rgba(102, 147, 95, 0.72)"
    },
    "under-contract": {
      color: "rgba(205, 168, 83, 0.96)",
      fillColor: "rgba(205, 168, 83, 0.72)"
    },
    "do-not-go": {
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

function getSavedShapeStyle_(status) {
  const base = getBuildingStyle(status, false);
  return {
    color: base.color,
    weight: 2.2,
    fillColor: base.fillColor,
    fillOpacity: 0.82
  };
}

function bringLayerGroupToFront_(layerGroup) {
  if (!layerGroup?.eachLayer) {
    return;
  }

  layerGroup.eachLayer((layer) => {
    if (typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
  });
}

function isLocationMatch(centroid, entry) {
  if (!centroid || !entry || typeof entry.lat !== "number" || typeof entry.lng !== "number") {
    return false;
  }

  return Math.abs(centroid.lat - entry.lat) <= 0.00012 && Math.abs(centroid.lng - entry.lng) <= 0.00012;
}

function isBuildingMatch(layer, entry) {
  if (!layer || !entry) {
    return false;
  }

  if (entry.buildingKey && layer.__buildingKey) {
    if (entry.buildingKey === layer.__buildingKey) {
      return true;
    }
  }

  if (isLocationMatch(layer.__centroid, entry)) {
    return true;
  }

  return isPropertyShapeHit_(entry, layer.__centroid);
}

async function findSavedPropertyForBuilding_(layer, location) {
  const localMatch = findSavedPropertyForBuildingInList_(state.properties, layer, location);
  if (localMatch) {
    return localMatch;
  }

  const freshProperties = await loadPropertiesFromSheet_();
  if (!freshProperties?.length) {
    return null;
  }

  state.properties = freshProperties;
  saveProperties();
  return findSavedPropertyForBuildingInList_(state.properties, layer, location);
}

function findSavedPropertyForBuildingInList_(properties, layer, location) {
  return properties.find((entry) => {
    if (isBuildingMatch(layer, entry)) {
      return true;
    }

    if (isPropertyShapeHit_(entry, location)) {
      return true;
    }

    return isLocationMatch(location, entry);
  }) || null;
}

async function findSavedPropertyAtLatLng_(latlng) {
  const localMatch = findSavedPropertyAtLatLngInList_(state.properties, latlng);
  if (localMatch) {
    return localMatch;
  }

  const freshProperties = await loadPropertiesFromSheet_();
  if (!freshProperties?.length) {
    return null;
  }

  state.properties = freshProperties;
  saveProperties();
  return findSavedPropertyAtLatLngInList_(state.properties, latlng);
}

function findSavedPropertyAtLatLngInList_(properties, latlng) {
  const lat = Number(latlng?.lat);
  const lng = Number(latlng?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  let closest = null;
  let closestDistance = Infinity;

  for (const property of properties) {
    const ring = parseShapePoints_(property.shapePoints);
    if (ring.length >= 3 && isPointInsidePolygon_([lat, lng], ring)) {
      return property;
    }

    const distance = Math.hypot(Number(property.lat) - lat, Number(property.lng) - lng);
    if (Number.isFinite(distance) && distance < closestDistance) {
      closestDistance = distance;
      closest = property;
    }
  }

  return closestDistance <= 0.00035 ? closest : null;
}

function isPropertyShapeHit_(property, latlng) {
  const lat = Number(latlng?.lat);
  const lng = Number(latlng?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  const ring = parseShapePoints_(property?.shapePoints);
  return ring.length >= 3 && isPointInsidePolygon_([lat, lng], ring);
}

async function openSavedPropertyFromMap_(property, layer, options = {}) {
  if (!property?.id) {
    return;
  }

  state.selectedBuildingLayer = layer || state.selectedBuildingLayer;
  state.previewProperty = null;
  state.selectedId = property.id;
  state.selectedPropertySnapshot = property;
  state.map?.closePopup();
  render();
  openSavedPropertyPopup_(property, options.latlng);
  refreshBuildingStyles();

  if (options.refresh === false) {
    return;
  }

  try {
    const freshProperties = await loadPropertiesFromSheet_();
    const freshProperty = findFreshPropertyMatch_(freshProperties, property);
    if (freshProperty) {
      const index = state.properties.findIndex((entry) => isSameSavedProperty_(entry, property));
      if (index >= 0) {
        state.properties[index] = freshProperty;
      }
      state.selectedId = freshProperty.id;
      state.selectedPropertySnapshot = freshProperty;
      saveProperties();
      render();
      openSavedPropertyPopup_(freshProperty, options.latlng);
      refreshBuildingStyles();
    }
  } catch {
    // The local copy is still enough to open the detail card.
  }
}

function findFreshPropertyMatch_(properties, property) {
  if (!Array.isArray(properties) || !property) {
    return null;
  }

  return properties.find((entry) => isSameSavedProperty_(entry, property)) || null;
}

function isSameSavedProperty_(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftAddress = normalizeComparableText_(left.address);
  const rightAddress = normalizeComparableText_(right.address);
  const leftShape = String(left.shapePoints || "").trim();
  const rightShape = String(right.shapePoints || "").trim();

  if (leftShape && rightShape && leftShape === rightShape) {
    return true;
  }

  if (leftAddress && rightAddress && leftAddress === rightAddress) {
    return true;
  }

  return String(left.id || "").trim() &&
    String(right.id || "").trim() &&
    String(left.id || "").trim() === String(right.id || "").trim() &&
    isLocationMatch(left, right);
}

function normalizeComparableText_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function openSavedPropertyPopup_(property, latlng) {
  if (!state.map || !property) {
    return;
  }

  const popupLocation = latlng || {
    lat: Number(property.lat),
    lng: Number(property.lng)
  };

  if (!Number.isFinite(Number(popupLocation.lat)) || !Number.isFinite(Number(popupLocation.lng))) {
    return;
  }

  const content = `
    <div class="map-preview-popup">
      <strong>${escapeHtml(property.address || "Saved property")}</strong>
      <p class="map-saved-popup-status">${escapeHtml(readableStatus(property.status))}</p>
      <p class="map-saved-popup-note">${escapeHtml(property.notes || "No notes yet.")}</p>
      ${renderSavedStatusControls_(property)}
    </div>
  `;

  L.popup({
    closeButton: true,
    autoClose: true,
    closeOnClick: true,
    className: "map-preview-leaflet-popup"
  })
    .setLatLng(popupLocation)
    .setContent(content)
    .openOn(state.map);

  window.requestAnimationFrame(() => {
    const popupRoot = document.querySelector(".map-preview-leaflet-popup .map-preview-popup");
    if (popupRoot) {
      attachSavedStatusControlHandlers_(property.id, popupRoot);
    }
  });
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

  return closestDistance <= 0.0018 ? closest : null;
}

async function ensureNearestBuildingLayer(lat, lng) {
  let matchedBuilding = findContainingBuildingLayer(lat, lng);
  if (matchedBuilding) {
    return matchedBuilding;
  }

  matchedBuilding = findNearestBuildingLayer(lat, lng);
  if (matchedBuilding) {
    return matchedBuilding;
  }

  await loadBuildingFootprints();
  matchedBuilding = findContainingBuildingLayer(lat, lng);
  if (matchedBuilding) {
    return matchedBuilding;
  }

  matchedBuilding = findNearestBuildingLayer(lat, lng);
  if (matchedBuilding) {
    return matchedBuilding;
  }

  await wait_(250);
  matchedBuilding = findNearestBuildingLayer(lat, lng);
  return matchedBuilding;
}

function waitForMapIdle_() {
  return new Promise((resolve) => {
    if (!state.map) {
      resolve();
      return;
    }
    state.map.once("moveend", () => {
      resolve();
    });
  });
}

function wait_(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function serializeShapePoints_(layer) {
  if (!layer?.getLatLngs) {
    return "";
  }

  const raw = layer.getLatLngs();
  const ring = Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(ring) || !ring.length) {
    return "";
  }

  return ring
    .map((point) => `${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`)
    .join(";");
}

function parseShapePoints_(value) {
  const text = String(value || "").trim();
  if (!text) {
    return [];
  }

  return text.split(";")
    .map((pair) => pair.split(","))
    .filter((pair) => pair.length === 2)
    .map(([lat, lng]) => [Number(lat), Number(lng)])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
}

function findContainingBuildingLayer(lat, lng) {
  if (!state.buildingLayer) {
    return null;
  }

  let containingLayer = null;
  let smallestArea = Infinity;

  state.buildingLayer.eachLayer((layer) => {
    if (!layer?.getLatLngs || !layer.getBounds?.().contains([lat, lng])) {
      return;
    }

    const raw = layer.getLatLngs();
    const ring = Array.isArray(raw[0]) ? raw[0] : raw;
    if (!Array.isArray(ring) || ring.length < 3) {
      return;
    }

    if (!isPointInsidePolygon_([lat, lng], ring)) {
      return;
    }

    const area = approximatePolygonArea_(ring);
    if (area < smallestArea) {
      smallestArea = area;
      containingLayer = layer;
    }
  });

  return containingLayer;
}

function isPointInsidePolygon_(point, ring) {
  const [testLat, testLng] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = Number(ring[i].lat ?? ring[i][0]);
    const xi = Number(ring[i].lng ?? ring[i][1]);
    const yj = Number(ring[j].lat ?? ring[j][0]);
    const xj = Number(ring[j].lng ?? ring[j][1]);

    const intersects = ((yi > testLat) !== (yj > testLat)) &&
      (testLng < ((xj - xi) * (testLat - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function approximatePolygonArea_(ring) {
  let area = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = Number(ring[i].lat ?? ring[i][0]);
    const xi = Number(ring[i].lng ?? ring[i][1]);
    const yj = Number(ring[j].lat ?? ring[j][0]);
    const xj = Number(ring[j].lng ?? ring[j][1]);
    area += (xj * yi) - (xi * yj);
  }

  return Math.abs(area / 2);
}

function findMatchingPropertyForPreview_() {
  if (!state.previewProperty) {
    return null;
  }

  const preview = state.previewProperty;
  return state.properties.find((entry) => {
    if (preview.buildingKey && entry.buildingKey && preview.buildingKey === entry.buildingKey) {
      return true;
    }

    if (preview.address && entry.address && String(preview.address).trim() === String(entry.address).trim()) {
      return true;
    }

    return isBuildingMatch(state.selectedBuildingLayer, entry) || isLocationMatch(preview, entry);
  }) || null;
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
