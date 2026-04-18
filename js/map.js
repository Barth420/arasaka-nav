/* ============================================================
   ARASAKA NAV — Map Setup
   Leaflet initialization, markers, layers, map events
   Centered on Mumbai, India — with persistent geolocation marker
   ============================================================ */

// Persistent geolocation state (survives clear)
let locationMarker = null;
window.userLocation = null;   // [lat, lon] — exposed for routing

/* --- Marker HTML Generators --- */
function originMarkerHTML() {
  return `<div class="mk-origin-wrap">
    <div class="mk-origin-ping"></div>
    <div class="mk-origin-diamond"></div>
  </div>`;
}

function destMarkerHTML() {
  return `<div class="mk-dest-wrap">
    <div class="mk-dest-ping"></div>
    <div class="mk-dest-diamond"></div>
  </div>`;
}

function vehicleMarkerHTML() {
  return `<div class="mk-vehicle-wrap">
    <div class="mk-vehicle-ping"></div>
    <div class="mk-vehicle-ping2"></div>
    <div class="mk-vehicle-arrow"></div>
    <div class="mk-vehicle-diamond"></div>
  </div>`;
}

function locationMarkerHTML() {
  return `<div class="mk-location-wrap">
    <div class="mk-location-ring"></div>
    <div class="mk-location-dot"></div>
  </div>`;
}

/* --- Initialize Leaflet Map --- */
function initMap() {
  S.map = L.map('map', {
    center: [19.0760, 72.8777],   // Mumbai
    zoom: 12,
    zoomControl: true,
    attributionControl: true,
    minZoom: 5,
    maxZoom: 19,
  });

  // CartoDB Dark Matter
  S.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://osm.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/" target="_blank">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(S.map);

  S.map.on('click', onMapClick);
  S.map.on('zoomend moveend', updateBottomStats);

  updateBottomStats();

  // Geolocation — try to get user position
  tryGeolocation();
}

/* --- Try to get geolocation and place marker --- */
function tryGeolocation() {
  if (!navigator.geolocation) {
    updateLocationButton(false);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      window.userLocation = [lat, lon];

      // Pan to user location
      S.map.setView([lat, lon], 14);

      // Place persistent "You Are Here" marker
      placeLocationMarker(lat, lon);

      // Enable "Use My Location" button
      updateLocationButton(true);

      showToast('LOCATION ACQUIRED', 'success', 2500);
    },
    () => {
      // Permission denied or unavailable — stay on Mumbai
      window.userLocation = null;
      updateLocationButton(false);
      showToast('LOCATION UNAVAILABLE — BROWSE MANUALLY', 'warn', 3000);
    },
    { timeout: 8000, enableHighAccuracy: false }
  );
}

/* --- Place / Update the "You Are Here" location marker --- */
function placeLocationMarker(lat, lon) {
  if (locationMarker) {
    locationMarker.setLatLng([lat, lon]);
    return;
  }

  const icon = L.divIcon({
    className:  '',
    html:       locationMarkerHTML(),
    iconSize:   [20, 20],
    iconAnchor: [10, 10],
  });

  locationMarker = L.marker([lat, lon], { icon, zIndexOffset: 800, interactive: false })
    .addTo(S.map)
    .bindTooltip('YOU ARE HERE', { direction: 'top', offset: [0, -12], permanent: false });
}

/* --- Enable/disable the Use My Location button --- */
function updateLocationButton(available) {
  const btn = $('use-location-btn');
  if (!btn) return;
  if (available) {
    btn.classList.remove('disabled');
    btn.title = 'Set current location as origin';
  } else {
    btn.classList.add('disabled');
    btn.title = 'Location not available';
  }
}

/* --- Map Click Handler --- */
async function onMapClick(e) {
  const lat = e.latlng.lat;
  const lon = e.latlng.lng;

  if (!S.originCoords) {
    S.originCoords = [lat, lon];
    setOriginMarker(lat, lon);

    const data = await reverseGeocode(lat, lon);
    S.originName = (data && data.display_name)
      ? data.display_name.split(',')[0].trim()
      : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    $('origin-input').value = S.originName;

    showToast('ORIGIN SET — CLICK TO SET DESTINATION', 'info', 2500);
  }
  else if (!S.destCoords) {
    S.destCoords = [lat, lon];
    setDestMarker(lat, lon);

    const data = await reverseGeocode(lat, lon);
    S.destName = (data && data.display_name)
      ? data.display_name.split(',')[0].trim()
      : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    $('dest-input').value = S.destName;

    fetchRoutes(S.originCoords, S.destCoords);
  }
  // Both set — do nothing until user clears
}

/* --- Set Origin Marker --- */
function setOriginMarker(lat, lon) {
  if (S.originMarker) S.map.removeLayer(S.originMarker);

  const icon = L.divIcon({
    className:  '',
    html:       originMarkerHTML(),
    iconSize:   [24, 24],
    iconAnchor: [12, 12],
  });

  S.originMarker = L.marker([lat, lon], { icon, draggable: true })
    .addTo(S.map)
    .bindTooltip('ORIGIN', { direction: 'top', offset: [0, -14] });

  S.originMarker.on('dragend', async (e) => {
    const pos = e.target.getLatLng();
    S.originCoords = [pos.lat, pos.lng];
    const data = await reverseGeocode(pos.lat, pos.lng);
    S.originName = (data && data.display_name)
      ? data.display_name.split(',')[0].trim()
      : `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    $('origin-input').value = S.originName;
    if (S.originCoords && S.destCoords) fetchRoutes(S.originCoords, S.destCoords);
  });
}

/* --- Set Destination Marker --- */
function setDestMarker(lat, lon) {
  if (S.destMarker) S.map.removeLayer(S.destMarker);

  const icon = L.divIcon({
    className:  '',
    html:       destMarkerHTML(),
    iconSize:   [24, 24],
    iconAnchor: [12, 12],
  });

  S.destMarker = L.marker([lat, lon], { icon, draggable: true })
    .addTo(S.map)
    .bindTooltip('DESTINATION', { direction: 'top', offset: [0, -14] });

  S.destMarker.on('dragend', async (e) => {
    const pos = e.target.getLatLng();
    S.destCoords = [pos.lat, pos.lng];
    const data = await reverseGeocode(pos.lat, pos.lng);
    S.destName = (data && data.display_name)
      ? data.display_name.split(',')[0].trim()
      : `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    $('dest-input').value = S.destName;
    if (S.originCoords && S.destCoords) fetchRoutes(S.originCoords, S.destCoords);
  });
}

/* --- Set Vehicle Marker --- */
function setVehicleMarker(lat, lon) {
  if (S.vehicleMarker) {
    S.vehicleMarker.setLatLng([lat, lon]);
    return;
  }

  const icon = L.divIcon({
    className:  '',
    html:       vehicleMarkerHTML(),
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
  });

  S.vehicleMarker = L.marker([lat, lon], { icon, zIndexOffset: 1000 })
    .addTo(S.map);
}

/* --- Remove Vehicle Marker --- */
function removeVehicleMarker() {
  if (S.vehicleMarker) {
    S.map.removeLayer(S.vehicleMarker);
    S.vehicleMarker = null;
  }
}

/* --- Fly to current user location --- */
function flyToUserLocation() {
  if (!window.userLocation) {
    showToast('LOCATION NOT AVAILABLE', 'error');
    return;
  }
  S.map.flyTo(window.userLocation, 15, { duration: 1.2 });
}

/* --- Update Bottom Bar Stats --- */
function updateBottomStats() {
  if (!S.map) return;

  const center = S.map.getCenter();
  const zoom   = S.map.getZoom();

  const coordsEl = $('bottom-coords');
  const zoomEl   = $('bottom-zoom');
  if (coordsEl) coordsEl.textContent = center.lat.toFixed(5) + ', ' + center.lng.toFixed(5);
  if (zoomEl)   zoomEl.textContent   = zoom;

  const rZoom = $('stat-zoom');
  if (rZoom) rZoom.textContent = zoom;

  const rBearing = $('stat-bearing');
  if (rBearing) {
    if (S.originCoords && S.destCoords) {
      const b = calcBearing(
        S.originCoords[0], S.originCoords[1],
        S.destCoords[0],   S.destCoords[1]
      );
      rBearing.textContent = Math.round(b) + '°';
    } else {
      rBearing.textContent = '---';
    }
  }
}

/* --- Night Mode Toggle --- */
function setNightMode(on) {
  S.nightMode = on;
  const tilePane = document.querySelector('.leaflet-tile-pane');
  if (tilePane) tilePane.classList.toggle('night-plus', on);
}
