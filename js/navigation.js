/* ============================================================
   ARASAKA NAV — Navigation & Simulation
   Turn-by-turn, HUD updates, simulation mode
   ============================================================ */

/* --- Start Navigation --- */
function startNavigation() {
  if (!S.routeData || !S.routeData[S.activeRoute]) {
    showToast('NO ROUTE AVAILABLE — SET ORIGIN & DESTINATION FIRST', 'error');
    return;
  }

  const routeData = S.routeData[S.activeRoute];
  const route = routeData.routes[0];
  if (!route || !route.segments || !route.segments[0]) return;

  S.navActive = true;
  S.steps = route.segments[0].steps;
  S.curStep = 0;

  // Use pre-computed mock coords or decode ORS polyline
  S.routeCoords = routeData._mockCoords ? routeData._mockCoords : decodePolyline(route.geometry);

  // Show navigation HUD
  const hud = $('nav-hud');
  if (hud) hud.classList.add('active');

  // Show speedometer section
  const speedSection = $('speedometer-section');
  if (speedSection) speedSection.classList.remove('hidden');

  const speedMeter = $('speed-meter');
  if (speedMeter) speedMeter.classList.remove('hidden');

  // Render TBT
  renderTBT();

  // Update HUD
  updateHUD();

  // Mode badge
  const badge = $('mode-label');
  if (badge) badge.textContent = 'NAVIGATING';

  showToast('NAVIGATION ACTIVE — USE SIM TO SIMULATE DRIVE', 'success', 4000);
}

/* --- Stop Navigation --- */
function stopNavigation() {
  S.navActive = false;
  S.curStep = 0;
  S.steps = [];

  stopSimulation();

  const hud = $('nav-hud');
  if (hud) hud.classList.remove('active');

  // Restore TBT placeholder
  const tbt = $('tbt-panel');
  if (tbt) {
    tbt.innerHTML = '<div class="tbt-placeholder">ROUTE LOADED — PRESS BEGIN NAVIGATION<br><span>OR CLICK A STEP ABOVE</span></div>';
  }

  removeVehicleMarker();

  const badge = $('mode-label');
  if (badge) badge.textContent = 'IDLE';

  // Hide speedometer
  const speedSection = $('speedometer-section');
  if (speedSection) speedSection.classList.add('hidden');

  const speedMeter = $('speed-meter');
  if (speedMeter) speedMeter.classList.add('hidden');

  const progEl = $('stat-progress');
  if (progEl) progEl.textContent = '0%';

  showToast('NAVIGATION STOPPED', 'info');
}

/* --- Render Turn-by-Turn List --- */
function renderTBT() {
  const container = $('tbt-panel');
  if (!container) return;
  container.innerHTML = '';

  if (!S.steps || S.steps.length === 0) {
    container.innerHTML = '<div class="tbt-placeholder">NO STEPS AVAILABLE</div>';
    return;
  }

  S.steps.forEach((step, i) => {
    const item = document.createElement('div');
    item.className = 'tbt-item' + (i === S.curStep ? ' active' : '');
    item.id = 'tbt-step-' + i;

    const icon = getManeuverIcon(step.instruction);
    const stepNum = String(i + 1).padStart(2, '0');
    // Sanitize instruction: keep mixed case, don't uppercase
    const instrText = step.instruction || 'Continue';

    item.innerHTML = `
      <div class="tbt-icon-box">${icon}</div>
      <div class="tbt-content">
        <div class="tbt-instruction">${instrText}</div>
        <div class="tbt-meta">
          <span class="tbt-dist">${formatDist(step.distance)}</span>
          <span class="tbt-step-num">#${stepNum}</span>
        </div>
      </div>
    `;

    item.addEventListener('click', () => goToStep(i));
    container.appendChild(item);
  });
}

/* --- Go to Specific Step --- */
function goToStep(stepIdx) {
  if (stepIdx < 0 || stepIdx >= S.steps.length) return;
  S.curStep = stepIdx;
  updateHUD();
  highlightTBTStep();
}

/* --- Advance Step (direction: 1 or -1) --- */
function advanceStep(dir) {
  if (!S.navActive) return;
  const next = S.curStep + dir;
  if (next < 0 || next >= S.steps.length) return;
  S.curStep = next;
  updateHUD();
  highlightTBTStep();
}

/* --- Highlight Current TBT Step --- */
function highlightTBTStep() {
  document.querySelectorAll('.tbt-item').forEach((item, i) => {
    item.classList.remove('active', 'completed');
    if (i < S.curStep) item.classList.add('completed');
    if (i === S.curStep) item.classList.add('active');
  });

  const activeItem = $('tbt-step-' + S.curStep);
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* --- Update Navigation HUD --- */
function updateHUD() {
  if (!S.navActive || !S.routeData || !S.routeData[S.activeRoute]) return;
  if (S.curStep >= S.steps.length) return;

  const step = S.steps[S.curStep];

  // Maneuver icon
  const iconEl = $('hud-icon');
  if (iconEl) iconEl.textContent = getManeuverIcon(step.instruction);

  // Distance to next maneuver
  const distEl = $('hud-dist');
  if (distEl) distEl.textContent = formatDist(step.distance);

  // Road name — try regex first, then fall back to step.name
  const roadEl = $('hud-road');
  if (roadEl) {
    const roadMatch = step.instruction.match(/onto (.+)/i) || step.instruction.match(/on (.+)/i);
    let roadName = roadMatch ? roadMatch[1] : (step.name || '');
    roadEl.textContent = roadName ? roadName.toUpperCase() : (step.instruction.includes('Depart') ? 'DEPARTING' : '---');
  }

  // Next instruction preview
  const nextEl = $('hud-next');
  if (nextEl) {
    const nextStep = S.steps[S.curStep + 1];
    nextEl.textContent = nextStep ? 'THEN: ' + nextStep.instruction : 'ARRIVING AT DESTINATION';
  }

  // Remaining distance & ETA
  const route = S.routeData[S.activeRoute].routes[0];
  let remainDist = 0, remainDur = 0;
  for (let i = S.curStep; i < S.steps.length; i++) {
    remainDist += S.steps[i].distance || 0;
    remainDur  += S.steps[i].duration || 0;
  }

  const hudEta    = $('hud-eta');
  const hudRemain = $('hud-remain');
  const hudArr    = $('hud-arrival');
  if (hudEta) hudEta.textContent = formatDurShort(remainDur);
  if (hudRemain) hudRemain.textContent = formatDist(remainDist);
  if (hudArr) hudArr.textContent = formatArrivalTime(remainDur);

  // Top bar step count
  const statStep = $('stat-step-text');
  if (statStep) statStep.textContent = (S.curStep + 1) + '/' + S.steps.length;

  // Progress
  const progress = Math.round((S.curStep / Math.max(S.steps.length - 1, 1)) * 100);
  const progEl = $('stat-progress');
  if (progEl) progEl.textContent = Math.min(progress, 100) + '%';
}

/* --- Start Simulation --- */
function startSimulation() {
  if (!S.navActive || !S.routeCoords || S.routeCoords.length === 0) {
    showToast('START NAVIGATION FIRST', 'error');
    return;
  }

  if (S.simActive) {
    stopSimulation();
    return;
  }

  S.simActive = true;
  S.simIdx = 0;

  const simBtn = $('hud-sim-btn');
  if (simBtn) {
    simBtn.textContent = 'PAUSE';
    simBtn.classList.add('active');
  }

  showToast('SIMULATION ACTIVE — DRIVING ROUTE', 'success', 2500);

  S.simInterval = setInterval(() => {
    if (S.simIdx >= S.routeCoords.length) {
      stopSimulation();
      showToast('DESTINATION REACHED', 'success', 4000);
      return;
    }

    const coord = S.routeCoords[S.simIdx];
    moveVehicle(coord);
    S.simIdx += 3;

    // Simulated speed: varies realistically
    const speed = Math.round(40 + Math.sin(S.simIdx * 0.07) * 20 + Math.random() * 8);
    const speedEl = $('speed-value');
    if (speedEl) speedEl.textContent = speed;

    const hudSpeed = $('hud-speed');
    if (hudSpeed) hudSpeed.textContent = speed + ' KM/H';

    // Step completion check
    checkStepCompletion(coord);

    // Progress bar
    const progress = Math.round((S.simIdx / S.routeCoords.length) * 100);
    const progEl = $('stat-progress');
    if (progEl) progEl.textContent = Math.min(progress, 100) + '%';

  }, 80);
}

/* --- Stop Simulation --- */
function stopSimulation() {
  S.simActive = false;
  if (S.simInterval) {
    clearInterval(S.simInterval);
    S.simInterval = null;
  }
  S.simIdx = 0;

  const simBtn = $('hud-sim-btn');
  if (simBtn) {
    simBtn.textContent = 'SIM';
    simBtn.classList.remove('active');
  }

  const speedEl = $('speed-value');
  if (speedEl) speedEl.textContent = '0';

  const hudSpeed = $('hud-speed');
  if (hudSpeed) hudSpeed.textContent = '0 KM/H';
}

/* --- Move Vehicle (during simulation) --- */
function moveVehicle(coord) {
  setVehicleMarker(coord[0], coord[1]);
  S.map.panTo([coord[0], coord[1]], { animate: true, duration: 0.07 });
}

/* --- Check if current position is near a step maneuver point --- */
function checkStepCompletion(coord) {
  if (!S.steps || S.curStep >= S.steps.length - 1) return;

  const step = S.steps[S.curStep];
  const wpEnd = step.way_points[1];
  if (wpEnd < S.routeCoords.length) {
    const maneuverCoord = S.routeCoords[wpEnd];
    const dist = coordDist(coord, maneuverCoord);
    if (dist < 0.002) {
      S.curStep++;
      updateHUD();
      highlightTBTStep();
    }
  }
}
