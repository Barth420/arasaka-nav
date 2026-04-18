/* ============================================================
   ARASAKA NAV — POI System
   Uses LeafletMarkerCluster for stable, decluttered display
   Click any marker → popup with SET ORIGIN / SET DESTINATION
   ============================================================ */

/* --- CP2077 POI Config with themed icons --- */
const POI_CONFIG = {
  hospital:   { glyph: '+',  label: 'TRAUMA CENTER', cssClass: 'poi-hospital',  iconClass: 'poi-icon-cross'  },
  clinic:     { glyph: '+',  label: 'RIPPERDOC',     cssClass: 'poi-hospital',  iconClass: 'poi-icon-cross'  },
  pharmacy:   { glyph: '+',  label: 'PHARMA',        cssClass: 'poi-hospital',  iconClass: 'poi-icon-cross'  },
  restaurant: { glyph: '🍔', label: 'FOOD VENDOR',   cssClass: 'poi-food',      iconClass: 'poi-icon-emoji'  },
  fast_food:  { glyph: '🍔', label: 'QUICK EATS',    cssClass: 'poi-food',      iconClass: 'poi-icon-emoji'  },
  cafe:       { glyph: '☕', label: 'SYNTH-CAFE',    cssClass: 'poi-cafe',      iconClass: 'poi-icon-emoji'  },
  clothes:    { glyph: '👕', label: 'JINGUJI',       cssClass: 'poi-clothing',  iconClass: 'poi-icon-emoji'  },
  mall:       { glyph: '🛍', label: 'MEGASTORE',     cssClass: 'poi-clothing',  iconClass: 'poi-icon-emoji'  },
  fuel:       { glyph: '⛽', label: 'FUEL DEPOT',    cssClass: 'poi-fuel',      iconClass: 'poi-icon-emoji'  },
  police:     { glyph: '★',  label: 'NCPD',          cssClass: 'poi-police',    iconClass: 'poi-icon-star'   },
};

// State
let poiClusterGroup = null;
let poiVisible      = true;
let lastPoiBounds   = null;
let poiFetchActive  = false;

/* ============================================================
   GLOBAL POPUP ACTIONS — called from inline onclick in popup
   ============================================================ */
window.poiSetOrigin = function(lat, lon, name) {
  S.originCoords = [lat, lon];
  S.originName   = name;
  $('origin-input').value = name;
  setOriginMarker(lat, lon);
  S.map.closePopup();
  showToast('ORIGIN SET: ' + name.toUpperCase(), 'success', 2500);
  if (S.originCoords && S.destCoords) fetchRoutes(S.originCoords, S.destCoords);
};

window.poiSetDest = function(lat, lon, name) {
  S.destCoords = [lat, lon];
  S.destName   = name;
  $('dest-input').value = name;
  setDestMarker(lat, lon);
  S.map.closePopup();
  showToast('DESTINATION SET: ' + name.toUpperCase(), 'success', 2500);
  if (S.originCoords && S.destCoords) fetchRoutes(S.originCoords, S.destCoords);
};

/* --- Create styled MarkerCluster group --- */
function createClusterGroup() {
  return L.markerClusterGroup({
    maxClusterRadius: 50,
    disableClusteringAtZoom: 15,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html:       `<div class="mk-poi-cluster"><span>${count}</span></div>`,
        className:  '',
        iconSize:   [32, 32],
        iconAnchor: [16, 16],
      });
    },
    animate:               false,
    animateAddingMarkers:  false,
    spiderfyOnMaxZoom:     false,
    showCoverageOnHover:   false,
    zoomToBoundsOnClick:   true,
  });
}

/* --- Generate POI Marker HTML --- */
function poiMarkerHTML(config, name) {
  return `<div class="mk-poi-wrap ${config.cssClass}" title="${name}">
    <div class="mk-poi-diamond"></div>
    <span class="mk-poi-glyph ${config.iconClass}">${config.glyph}</span>
  </div>`;
}

/* --- Generate popup HTML for a POI marker --- */
function poiPopupHTML(lat, lon, name, config) {
  // Escape single quotes in name for inline onclick
  const safeName = name.replace(/'/g, "\\'");
  return `
    <div class="poi-popup">
      <div class="poi-popup-glyph ${config.cssClass}">${config.glyph}</div>
      <div class="poi-popup-info">
        <div class="poi-popup-name">${name.toUpperCase()}</div>
        <div class="poi-popup-type">${config.label}</div>
      </div>
      <div class="poi-popup-actions">
        <button class="poi-popup-btn origin" onclick="poiSetOrigin(${lat}, ${lon}, '${safeName}')">
          ◈ SET ORIGIN
        </button>
        <button class="poi-popup-btn dest" onclick="poiSetDest(${lat}, ${lon}, '${safeName}')">
          ◉ SET DEST
        </button>
      </div>
    </div>
  `;
}

/* --- Determine POI config from element tags --- */
function getPOIConfig(tags) {
  if (!tags) return null;
  if (tags.amenity === 'hospital')   return POI_CONFIG.hospital;
  if (tags.amenity === 'clinic')     return POI_CONFIG.clinic;
  if (tags.amenity === 'pharmacy')   return POI_CONFIG.pharmacy;
  if (tags.amenity === 'restaurant') return POI_CONFIG.restaurant;
  if (tags.amenity === 'fast_food')  return POI_CONFIG.fast_food;
  if (tags.amenity === 'cafe')       return POI_CONFIG.cafe;
  if (tags.shop    === 'clothes')    return POI_CONFIG.clothes;
  if (tags.shop    === 'mall')       return POI_CONFIG.mall;
  if (tags.amenity === 'fuel')       return POI_CONFIG.fuel;
  if (tags.amenity === 'police')     return POI_CONFIG.police;
  return null;
}

/* --- Query Overpass API --- */
async function fetchPOIs(bounds) {
  const s = bounds.getSouth(), w = bounds.getWest();
  const n = bounds.getNorth(), e = bounds.getEast();
  const bbox  = `(${s},${w},${n},${e})`;
  const nodes = [
    'node["amenity"="hospital"]',
    'node["amenity"="clinic"]',
    'node["amenity"="restaurant"]',
    'node["amenity"="fast_food"]',
    'node["amenity"="cafe"]',
    'node["shop"="clothes"]',
    'node["amenity"="fuel"]',
    'node["amenity"="police"]',
    'node["amenity"="pharmacy"]',
  ].map(q => q + bbox + ';').join('\n');

  const query = `[out:json][timeout:20];\n(\n${nodes}\n);\nout center 120;`;

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method:  'POST',
      body:    'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!resp.ok) throw new Error('Overpass ' + resp.status);
    const data = await resp.json();
    return data.elements || [];
  } catch (err) {
    console.warn('POI fetch failed:', err.message);
    return [];
  }
}

/* --- Rebuild cluster group from fetched elements --- */
function renderPOIs(elements) {
  if (poiClusterGroup) {
    S.map.removeLayer(poiClusterGroup);
    poiClusterGroup = null;
  }

  if (!elements || elements.length === 0) return;

  const cluster = createClusterGroup();

  elements.forEach(el => {
    const lat = el.lat || (el.center && el.center.lat);
    const lon = el.lon || (el.center && el.center.lon);
    if (!lat || !lon) return;

    const config = getPOIConfig(el.tags);
    if (!config) return;

    const name = (el.tags && el.tags.name) ? el.tags.name : config.label;

    const icon = L.divIcon({
      className:  '',
      html:       poiMarkerHTML(config, name),
      iconSize:   [28, 28],
      iconAnchor: [14, 14],
    });

    const marker = L.marker([lat, lon], { icon });

    // Bind popup with route actions
    marker.bindPopup(poiPopupHTML(lat, lon, name, config), {
      className:  'cp-poi-popup',
      maxWidth:   220,
      minWidth:   180,
      closeButton: true,
    });

    marker.addTo(cluster);
  });

  poiClusterGroup = cluster;
  if (poiVisible) poiClusterGroup.addTo(S.map);
}

/* --- Load POIs for current view --- */
async function loadPOIsForView() {
  if (!S.map || poiFetchActive) return;

  const zoom = S.map.getZoom();

  if (zoom < 13) {
    if (poiClusterGroup && S.map.hasLayer(poiClusterGroup)) {
      S.map.removeLayer(poiClusterGroup);
    }
    return;
  }

  // Re-show if zoomed back in and data is still valid
  if (poiClusterGroup && poiVisible && !S.map.hasLayer(poiClusterGroup)) {
    poiClusterGroup.addTo(S.map);
    return;
  }

  const bounds = S.map.getBounds();

  if (lastPoiBounds) {
    const c  = bounds.getCenter();
    const lc = lastPoiBounds.getCenter();
    if (coordDist([c.lat, c.lng], [lc.lat, lc.lng]) < 0.012) return;
  }

  lastPoiBounds  = bounds;
  poiFetchActive = true;

  try {
    const elements = await fetchPOIs(bounds);
    renderPOIs(elements);
  } finally {
    poiFetchActive = false;
  }
}

/* --- Toggle POI Visibility --- */
function togglePOIs(visible) {
  poiVisible = visible;
  if (!poiClusterGroup) return;
  if (visible && !S.map.hasLayer(poiClusterGroup)) {
    poiClusterGroup.addTo(S.map);
  } else if (!visible && S.map.hasLayer(poiClusterGroup)) {
    S.map.removeLayer(poiClusterGroup);
  }
}

/* --- Reset POI bounds cache (after clear) --- */
function resetPOIs() {
  lastPoiBounds = null;
}

/* --- Setup POI auto-load on map move --- */
function setupPOILoader() {
  if (!S.map) return;
  const debouncedLoad = debounce(loadPOIsForView, 1500);
  S.map.on('moveend', debouncedLoad);
  S.map.on('zoomend', debouncedLoad);
  setTimeout(loadPOIsForView, 2000);
}
