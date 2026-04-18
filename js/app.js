/* ============================================================
   ARASAKA NAV — App Controller
   Boot sequence, modal flow, event wiring, keyboard shortcuts
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Step 1: Check for existing ORS key ──
  const storedKey = sessionStorage.getItem('ors_key');

  if (storedKey) {
    S.orsKey = storedKey;
    S.demoMode = false;
    $('api-modal').style.display = 'none';
    $('boot-screen').style.display = 'flex';
    runBoot(false);
  } else {
    // No key — show modal
    $('api-modal').style.display = 'flex';
    $('boot-screen').style.display = 'none';
  }

  // ── Step 2: Modal handlers ──
  $('modal-submit').addEventListener('click', activateSystems);
  $('ors-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') activateSystems();
  });

  // ── Demo Mode: skip API key ──
  $('modal-demo').addEventListener('click', () => {
    sessionStorage.removeItem('ors_key');  // clear any stale key
    S.orsKey = '';
    S.demoMode = true;
    $('api-modal').style.display = 'none';
    $('boot-screen').style.display = 'flex';
    runBoot(true);
  });

  // ── Step 3: Start Clock ──
  updateClock();
  setInterval(updateClock, 1000);

  // ── Step 4: Wire Up Event Listeners ──
  setupEventListeners();
});

/* --- Activate Systems (modal → boot) --- */
function activateSystems() {
  const input = $('ors-key-input');
  const errorEl = $('modal-error');
  const key = input.value.trim();

  if (key.length <= 20) {
    errorEl.textContent = 'KEY TOO SHORT — MUST BE >20 CHARACTERS';
    return;
  }

  S.orsKey = key;
  S.demoMode = false;
  sessionStorage.setItem('ors_key', key);

  $('api-modal').style.display = 'none';
  $('boot-screen').style.display = 'flex';
  runBoot(false);
}

/* --- Boot Sequence --- */
function runBoot(isDemoMode) {
  const bootLines = [
    { text: 'Initializing ARASAKA NAV core systems...', status: 'ok', statusText: 'OK' },
    { text: 'Loading Leaflet.js map engine v1.9.4...', status: 'ok', statusText: 'LOADED' },
    { text: 'Connecting to CARTO dark tile servers...', status: 'ok', statusText: 'CONNECTED' },
    isDemoMode
      ? { text: 'OpenRouteService API key not provided — entering demo mode...', status: 'warn', statusText: 'DEMO' }
      : { text: 'Authenticating OpenRouteService API key...', status: 'ok', statusText: 'VALID' },
    { text: 'Calibrating Nominatim geocoder (Mumbai, India bias)...', status: 'warn', statusText: 'RATE LIMITED' },
    { text: 'Loading POI database (Overpass API)...', status: 'ok', statusText: 'READY' },
    { text: 'All systems operational. Launching interface...', status: 'ok', statusText: 'READY' },
  ];

  const container = $('boot-lines');
  const progressFill = $('boot-progress-fill');
  container.innerHTML = '';

  bootLines.forEach((line, i) => {
    const el = document.createElement('div');
    el.className = 'boot-line';
    el.id = 'boot-line-' + i;
    el.innerHTML = `${line.text} <span class="status ${line.status}">[${line.statusText}]</span>`;
    container.appendChild(el);
  });

  let step = 0;
  const delays = [400, 700, 500, 600, 500, 400, 800];

  function showNextLine() {
    if (step >= bootLines.length) {
      setTimeout(() => {
        $('boot-screen').style.display = 'none';
        initMap();
        setupSearchInput('origin-input', 'origin-results', 'origin');
        setupSearchInput('dest-input', 'dest-results', 'dest');
        setupPOILoader();
        updateAPIBadge();
        if (isDemoMode) {
          showToast('DEMO MODE — CLICK MAP TO SET ORIGIN & DESTINATION', 'warn', 5000);
        } else {
          showToast('SYSTEMS ONLINE — WELCOME TO ARASAKA NAV', 'success', 4000);
        }
      }, 600);
      return;
    }

    const lineEl = $('boot-line-' + step);
    lineEl.classList.add('visible');

    const progress = Math.round(((step + 1) / bootLines.length) * 100);
    progressFill.style.width = progress + '%';

    step++;
    setTimeout(showNextLine, delays[step - 1] || 500);
  }

  setTimeout(showNextLine, 300);
}

/* --- Setup All Event Listeners --- */
function setupEventListeners() {
  const leftToggle = $('left-toggle');
  const rightToggle = $('right-toggle');

  if (leftToggle) leftToggle.addEventListener('click', () => togglePanel('left'));
  if (rightToggle) rightToggle.addEventListener('click', () => togglePanel('right'));

  const swapBtn = $('swap-btn');
  if (swapBtn) swapBtn.addEventListener('click', swapOriginDest);

  const clearBtn = $('clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearAll);

  const navBtn = $('begin-nav-btn');
  if (navBtn) navBtn.addEventListener('click', startNavigation);

  const simBtn = $('hud-sim-btn');
  if (simBtn) simBtn.addEventListener('click', startSimulation);

  const stopBtn = $('hud-stop-btn');
  if (stopBtn) stopBtn.addEventListener('click', stopNavigation);

  // Use My Location as origin
  const locBtn = $('use-location-btn');
  if (locBtn) {
    locBtn.addEventListener('click', () => {
      if (!window.userLocation) {
        showToast('LOCATION NOT AVAILABLE', 'error');
        return;
      }
      const [lat, lon] = window.userLocation;
      S.originCoords = [lat, lon];
      S.originName   = 'MY LOCATION';
      $('origin-input').value = 'MY LOCATION';
      setOriginMarker(lat, lon);
      flyToUserLocation();
      showToast('ORIGIN SET TO YOUR LOCATION', 'success', 2500);
      if (S.originCoords && S.destCoords) fetchRoutes(S.originCoords, S.destCoords);
    });
  }

  setupLayerToggles();
  document.addEventListener('keydown', handleKeyboard);
}

/* --- Panel Toggle --- */
function togglePanel(side) {
  if (side === 'left') {
    S.leftOpen = !S.leftOpen;
    $('left-panel').classList.toggle('collapsed', !S.leftOpen);
    $('left-toggle').classList.toggle('shifted', !S.leftOpen);
    $('left-toggle').textContent = S.leftOpen ? '◂' : '▸';
  } else {
    S.rightOpen = !S.rightOpen;
    $('right-panel').classList.toggle('collapsed', !S.rightOpen);
    $('right-toggle').classList.toggle('shifted', !S.rightOpen);
    $('right-toggle').textContent = S.rightOpen ? '▸' : '◂';
  }

  setTimeout(() => {
    if (S.map) S.map.invalidateSize();
  }, 350);
}

/* --- SWAP Origin/Destination --- */
function swapOriginDest() {
  // Stop navigation before swapping
  if (S.navActive) stopNavigation();

  const tmpCoords = S.originCoords;
  const tmpName = S.originName;

  S.originCoords = S.destCoords;
  S.originName = S.destName;
  S.destCoords = tmpCoords;
  S.destName = tmpName;

  $('origin-input').value = S.originName || '';
  $('dest-input').value = S.destName || '';

  if (S.originCoords) setOriginMarker(S.originCoords[0], S.originCoords[1]);
  if (S.destCoords) setDestMarker(S.destCoords[0], S.destCoords[1]);

  if (S.originCoords && S.destCoords) {
    fetchRoutes(S.originCoords, S.destCoords);
  }
}

/* --- Clear All --- */
function clearAll() {
  if (S.navActive) stopNavigation();

  clearRoutes();

  if (S.originMarker) { S.map.removeLayer(S.originMarker); S.originMarker = null; }
  if (S.destMarker) { S.map.removeLayer(S.destMarker); S.destMarker = null; }
  removeVehicleMarker();

  S.originCoords = null;
  S.destCoords = null;
  S.originName = '';
  S.destName = '';

  $('origin-input').value = '';
  $('dest-input').value = '';

  const tbt = $('tbt-panel');
  if (tbt) {
    tbt.innerHTML = '<div class="tbt-placeholder">SET ORIGIN &amp; DESTINATION<br><span>TO COMPUTE ROUTE</span></div>';
  }

  // Reset POI bounds so next pan gets fresh data
  if (typeof resetPOIs === 'function') resetPOIs();

  // Reset traffic badge
  const trafficEl = $('stat-traffic');
  if (trafficEl) {
    trafficEl.textContent = 'CLEAR';
    trafficEl.style.color = 'var(--cp-green)';
  }

  showToast('ALL DATA CLEARED', 'info');
}

/* --- Layer Toggles --- */
function setupLayerToggles() {
  const nightToggle = $('toggle-night');
  if (nightToggle) {
    nightToggle.addEventListener('click', () => {
      nightToggle.classList.toggle('on');
      setNightMode(nightToggle.classList.contains('on'));
    });
  }

  const trafficToggle = $('toggle-traffic');
  if (trafficToggle) {
    trafficToggle.addEventListener('click', () => {
      trafficToggle.classList.toggle('on');
      const show = trafficToggle.classList.contains('on');
      S.trafficLayers.forEach(l => {
        if (show) l.addTo(S.map);
        else S.map.removeLayer(l);
      });
    });
  }

  const poiToggle = $('toggle-poi');
  if (poiToggle) {
    poiToggle.addEventListener('click', () => {
      poiToggle.classList.toggle('on');
      togglePOIs(poiToggle.classList.contains('on'));
    });
  }
}

/* --- Keyboard Shortcuts --- */
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'Escape':
      if (S.navActive) stopNavigation();
      else clearAll();
      break;
    case 'ArrowRight':
      advanceStep(1);
      break;
    case 'ArrowLeft':
      advanceStep(-1);
      break;
    case 's':
    case 'S':
      if (S.navActive) startSimulation();
      break;
    case 'l':
    case 'L':
      togglePanel('left');
      break;
    case 'r':
    case 'R':
      togglePanel('right');
      break;
  }
}
