/* ============================================================
   ARASAKA NAV — Routing (OpenRouteService + Mock Fallback)
   Fetch routes, decode polylines, draw with triple glow,
   traffic coloring, route cards
   ============================================================ */

const ROUTE_PREFERENCES = ['fastest', 'recommended', 'shortest'];

/* ============================================================
   MOCK ROUTE GENERATOR — used when no ORS API key is present
   Generates a curved path with realistic stats for UI testing
   ============================================================ */

function generateMockRoute(orig, dest, preference) {
  const numPoints = 80;
  const coords = [];

  const latDiff = dest[0] - orig[0];
  const lonDiff = dest[1] - orig[1];

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;

    const lat = orig[0] + latDiff * t;
    const lon = orig[1] + lonDiff * t;

    // Sinusoidal offset perpendicular to the route direction
    const curveMag = preference === 'shortest' ? 0.0015 : preference === 'fastest' ? 0.005 : 0.003;
    const wave = Math.sin(t * Math.PI * (preference === 'fastest' ? 3 : 2)) * curveMag;
    const perpLat = -lonDiff;
    const perpLon = latDiff;
    const perpLen = Math.sqrt(perpLat * perpLat + perpLon * perpLon) || 1;

    coords.push([
      lat + (perpLat / perpLen) * wave,
      lon + (perpLon / perpLen) * wave,
    ]);
  }

  // Haversine distance along path
  let totalDist = 0;
  for (let i = 1; i < coords.length; i++) {
    totalDist += haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  }

  // Route variant: distance path + realistic speed per preference
  // FASTEST  = highway route (slightly longer path, much faster avg speed)
  // RECOMMENDED = balanced city route  
  // SHORTEST = shortest path but local slow roads
  //
  // Duration = distance / speed — fastest must have lowest duration
  const distMultiplier = preference === 'fastest' ? 1.25 : preference === 'recommended' ? 1.10 : 1.0;
  const routeDist  = totalDist * distMultiplier;
  const avgSpeedMs = preference === 'fastest' ? 16.7 : preference === 'recommended' ? 9.7 : 5.6; // 60 / 35 / 20 km/h
  const routeDur   = routeDist / avgSpeedMs;

  // Mock street names and instructions
  const streetPool = ['MAIN ROAD', 'LINK ROAD', 'HIGHWAY BYPASS', 'INNER RING RD', 'SECTOR BLVD', 'CROSS ROAD', 'OVERPASS LINK', 'JUNCTION AVE'];
  const rd1 = streetPool[Math.floor(Math.random() * streetPool.length)];
  const rd2 = streetPool[Math.floor(Math.random() * streetPool.length)];
  const rd3 = streetPool[Math.floor(Math.random() * streetPool.length)];
  const rd4 = streetPool[Math.floor(Math.random() * streetPool.length)];

  const mockInstructions = [
    { instruction: 'Depart — head towards destination',    name: rd1 },
    { instruction: `Turn right onto ${rd1}`,               name: rd1 },
    { instruction: `Continue straight on ${rd1}`,          name: rd1 },
    { instruction: `Keep left onto ${rd2}`,                name: rd2 },
    { instruction: `Turn left onto ${rd3}`,                name: rd3 },
    { instruction: `Merge onto ${rd3}`,                    name: rd3 },
    { instruction: `Continue straight on ${rd4}`,          name: rd4 },
    { instruction: `Turn right onto ${rd4}`,               name: rd4 },
    { instruction: 'Arrive at destination',                name: '' },
  ];

  const stepCount = mockInstructions.length;
  const baseDist = routeDist / stepCount;
  const baseDur = routeDur / stepCount;
  const stepsPerSeg = Math.floor(numPoints / stepCount);

  const steps = mockInstructions.map((s, i) => ({
    instruction: s.instruction,
    name: s.name,
    distance: baseDist * (0.65 + Math.random() * 0.7),
    duration: baseDur * (0.65 + Math.random() * 0.7),
    way_points: [i * stepsPerSeg, Math.min((i + 1) * stepsPerSeg, numPoints)],
  }));

  return {
    _mockCoords: coords,
    routes: [{
      summary: { distance: routeDist, duration: routeDur },
      geometry: '__MOCK__',
      segments: [{ steps }],
    }],
  };
}

/* --- Fetch 3 Route Variants --- */
async function fetchRoutes(orig, dest) {
  if (!S.orsKey) {
    // ── DEMO MODE: generate mock routes ──
    clearRoutes();

    const cardsEl = $('route-cards');
    if (cardsEl) {
      cardsEl.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div><div style="margin-top:8px;font-size:9px;color:var(--cp-text-dim);letter-spacing:2px;">COMPUTING ROUTES...</div></div>';
      cardsEl.classList.remove('hidden');
    }

    await new Promise(r => setTimeout(r, 800));

    S.routeData = ROUTE_PREFERENCES.map(pref => generateMockRoute(orig, dest, pref));
    S.activeRoute = 0;

    drawAllRoutes();
    renderRouteCards(S.routeData);
    updateTopBarStats();
    updateTrafficBadge();

    const navBtn = $('begin-nav-btn');
    if (navBtn) navBtn.classList.remove('hidden');

    if (S.routeLayers.length > 0) {
      try {
        const bounds = S.routeLayers[0].getBounds();
        S.map.fitBounds(bounds, { padding: [60, 60] });
      } catch (e) { /* bounds may be empty */ }
    }
    return;
  }

  // ── LIVE MODE: call ORS API ──
  clearRoutes();

  const cardsEl = $('route-cards');
  if (cardsEl) {
    cardsEl.innerHTML = '<div style="text-align:center;padding:20px;"><div class="spinner"></div><div style="margin-top:8px;font-size:9px;color:var(--cp-text-dim);letter-spacing:2px;">COMPUTING ROUTES...</div></div>';
    cardsEl.classList.remove('hidden');
  }

  try {
    const requests = ROUTE_PREFERENCES.map(pref =>
      fetch('https://api.openrouteservice.org/v2/directions/driving-car/json', {
        method: 'POST',
        headers: {
          'Authorization': S.orsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [[orig[1], orig[0]], [dest[1], dest[0]]],
          preference: pref,
          instructions: true,
          instructions_format: 'text',
          language: 'en',
          units: 'm',
          geometry: true,
        }),
      }).then(r => {
        if (!r.ok) throw new Error('ORS ' + pref + ': ' + r.status);
        return r.json();
      })
    );

    const results = await Promise.all(requests);
    S.routeData = results;
    S.activeRoute = 0;

    drawAllRoutes();
    renderRouteCards(results);
    updateTopBarStats();
    updateTrafficBadge();

    const navBtn = $('begin-nav-btn');
    if (navBtn) navBtn.classList.remove('hidden');

    if (S.routeLayers.length > 0) {
      try {
        const bounds = S.routeLayers[0].getBounds();
        S.map.fitBounds(bounds, { padding: [60, 60] });
      } catch (e) { /* bounds empty */ }
    }

  } catch (err) {
    console.error('Route fetch failed:', err);
    showToast('ROUTING FAILED: ' + err.message, 'error');
    if (cardsEl) {
      cardsEl.innerHTML = `<div style="padding:12px;font-size:10px;color:var(--cp-red);letter-spacing:1px;">ERROR: ${err.message}</div>`;
    }
  }
}

/* --- Draw All Routes --- */
function drawAllRoutes() {
  if (!S.routeData) return;

  S.routeData.forEach((data, idx) => {
    if (!data.routes || data.routes.length === 0) return;
    const route = data.routes[0];
    // Use pre-computed mock coords if available
    const coords = data._mockCoords ? data._mockCoords : decodePolyline(route.geometry);

    if (idx === S.activeRoute) {
      drawActiveRoute(coords, route.segments);
    } else {
      drawAltRoute(coords, idx, data);
    }
  });
}

/* --- Draw Active Route (Triple Glow) --- */
function drawActiveRoute(coords, segments) {
  const latLngs = coords.map(c => L.latLng(c[0], c[1]));

  // Layer 1: Outer glow
  const outer = L.polyline(latLngs, {
    color: 'rgba(0,245,255,0.10)',
    weight: 20,
    interactive: false,
  }).addTo(S.map);

  // Layer 2: Mid glow
  const mid = L.polyline(latLngs, {
    color: 'rgba(0,245,255,0.22)',
    weight: 10,
    interactive: false,
  }).addTo(S.map);

  // Layer 3: Sharp core line
  const sharp = L.polyline(latLngs, {
    color: '#00F5FF',
    weight: 3,
    opacity: 0.95,
    interactive: false,
  }).addTo(S.map);

  S.routeLayers.push(outer, mid, sharp);

  // Traffic coloring (real routes only)
  if (segments && segments[0] && segments[0].steps && !S.demoMode) {
    drawTrafficColors(segments[0].steps, coords);
  }

  S.routeCoords = coords;
}

/* --- Draw Alt Route --- */
function drawAltRoute(coords, index, data) {
  const latLngs = coords.map(c => L.latLng(c[0], c[1]));

  const line = L.polyline(latLngs, {
    color: 'rgba(255,255,255,0.15)',
    weight: 2.5,
    dashArray: '7 5',
    interactive: true,
  }).addTo(S.map);

  line.on('click', () => selectRoute(index));

  S.altLayers.push(line);
}

/* --- Traffic Coloring per Step --- */
function drawTrafficColors(steps, allCoords) {
  steps.forEach(step => {
    const wpStart = step.way_points[0];
    const wpEnd = step.way_points[1];
    const stepCoords = allCoords.slice(wpStart, wpEnd + 1);

    if (stepCoords.length < 2) return;

    const ratio = step.duration / (step.distance / 14);
    let color;
    if (ratio > 1.8) color = '#FF3D3D';
    else if (ratio > 1.3) color = '#FF8C00';
    else color = '#39FF14';

    const latLngs = stepCoords.map(c => L.latLng(c[0], c[1]));
    const line = L.polyline(latLngs, {
      color,
      weight: 3,
      opacity: 0.7,
      interactive: false,
    }).addTo(S.map);

    S.trafficLayers.push(line);
  });
}

/* --- Update Traffic Badge in Top Bar --- */
function updateTrafficBadge() {
  const el = $('stat-traffic');
  if (!el) return;

  if (S.demoMode) {
    // Simulate a traffic status based on route index
    const statuses = ['CLEAR', 'MODERATE', 'CLEAR'];
    const colors   = ['var(--cp-green)', 'var(--cp-orange)', 'var(--cp-green)'];
    el.textContent = statuses[S.activeRoute] || 'CLEAR';
    el.style.color = colors[S.activeRoute] || 'var(--cp-green)';
  } else if (S.routeData && S.routeData[S.activeRoute]) {
    const route = S.routeData[S.activeRoute].routes[0];
    const summary = route && route.summary;
    if (!summary) return;
    const ratio = summary.duration / (summary.distance / 14);
    if (ratio > 1.8) {
      el.textContent = 'HEAVY';
      el.style.color = 'var(--cp-red)';
    } else if (ratio > 1.3) {
      el.textContent = 'MODERATE';
      el.style.color = 'var(--cp-orange)';
    } else {
      el.textContent = 'CLEAR';
      el.style.color = 'var(--cp-green)';
    }
  }
}

/* --- Select Route by Index --- */
function selectRoute(index) {
  S.activeRoute = index;

  clearRouteVisuals();
  drawAllRoutes();

  document.querySelectorAll('.route-card').forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });

  updateTopBarStats();
  updateTrafficBadge();

  if (S.routeLayers.length > 0) {
    try {
      const bounds = S.routeLayers[0].getBounds();
      S.map.fitBounds(bounds, { padding: [60, 60] });
    } catch(e) {}
  }
}

/* --- Render Route Cards --- */
function renderRouteCards(results) {
  const container = $('route-cards');
  if (!container) return;
  container.innerHTML = '';

  const labels = ['FASTEST', 'RECOMMENDED', 'SHORTEST'];
  const tags   = ['[SPEED]', '[BALANCED]', '[DISTANCE]'];

  results.forEach((data, idx) => {
    if (!data.routes || data.routes.length === 0) return;
    const route = data.routes[0];
    const summary = route.summary;

    const dist = formatDist(summary.distance);
    const dur  = formatDur(summary.duration);
    const eta  = formatArrivalTime(summary.duration);

    const card = document.createElement('div');
    card.className = 'route-card' + (idx === S.activeRoute ? ' active' : '');
    card.innerHTML = `
      <div class="route-card-header">
        <span class="route-card-label">${labels[idx]}</span>
        <span class="route-card-tag">${tags[idx]}</span>
      </div>
      <div class="route-card-stats">
        <div class="route-card-stat">
          <span class="rcs-label">DURATION</span>
          <span class="rcs-value">${dur}</span>
        </div>
        <div class="route-card-stat">
          <span class="rcs-label">DISTANCE</span>
          <span class="rcs-value">${dist}</span>
        </div>
        <div class="route-card-stat">
          <span class="rcs-label">ARRIVAL</span>
          <span class="rcs-value">${eta}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => selectRoute(idx));
    container.appendChild(card);
  });

  container.classList.remove('hidden');
}

/* --- Update Top Bar Stats --- */
function updateTopBarStats() {
  if (!S.routeData || !S.routeData[S.activeRoute]) return;
  const route = S.routeData[S.activeRoute].routes[0];
  if (!route) return;

  const summary = route.summary;

  const etaEl   = $('stat-eta');
  const distEl  = $('stat-dist');
  const stepsEl = $('stat-step-text');

  if (etaEl) etaEl.textContent = formatDurShort(summary.duration);
  if (distEl) distEl.textContent = formatDist(summary.distance);
  if (stepsEl && route.segments && route.segments[0]) {
    stepsEl.textContent = '1/' + route.segments[0].steps.length;
  }

  // Right panel step count
  const rSteps = $('stat-step-count');
  if (rSteps && route.segments && route.segments[0]) {
    rSteps.textContent = route.segments[0].steps.length;
  }

  // Update bearing in right panel (after route loads)
  updateBottomStats();
}

/* --- Clear Route Visuals (layers only) --- */
function clearRouteVisuals() {
  S.routeLayers.forEach(l => S.map.removeLayer(l));
  S.routeLayers = [];
  S.trafficLayers.forEach(l => S.map.removeLayer(l));
  S.trafficLayers = [];
  S.altLayers.forEach(l => S.map.removeLayer(l));
  S.altLayers = [];
}

/* --- Clear Everything (routes, state) --- */
function clearRoutes() {
  clearRouteVisuals();
  S.routeData = null;
  S.routeCoords = [];
  S.activeRoute = 0;

  const cardsEl = $('route-cards');
  if (cardsEl) {
    cardsEl.innerHTML = '';
    cardsEl.classList.add('hidden');
  }

  const navBtn = $('begin-nav-btn');
  if (navBtn) navBtn.classList.add('hidden');

  const etaEl   = $('stat-eta');
  const distEl  = $('stat-dist');
  const stepsEl = $('stat-step-text');
  if (etaEl) etaEl.textContent = '--:--';
  if (distEl) distEl.textContent = '---';
  if (stepsEl) stepsEl.textContent = '--/--';
}
