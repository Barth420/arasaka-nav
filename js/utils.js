/* ============================================================
   ARASAKA NAV — Utilities
   Global state, debounce, LRU cache, formatters, helpers
   ============================================================ */

/* --- Global Application State --- */
window.S = {
  map: null,
  tileLayer: null,
  orsKey: null,        // null = not initialized, '' = demo mode, string = live key

  // Markers
  originMarker: null,
  destMarker: null,
  vehicleMarker: null,

  // Coordinates [lat, lon] — Leaflet convention
  originCoords: null,
  destCoords: null,
  originName: '',
  destName: '',

  // Routing
  routeData: null,       // array of 3 route responses
  activeRoute: 0,        // index of selected route
  routeLayers: [],       // Leaflet polyline layers
  trafficLayers: [],     // traffic-colored segments
  altLayers: [],         // alt route layers

  // Navigation
  navActive: false,
  steps: [],
  curStep: 0,
  routeCoords: [],       // decoded polyline coords for active route

  // Simulation
  simActive: false,
  simInterval: null,
  simIdx: 0,

  // UI state
  leftOpen: true,
  rightOpen: true,
  nightMode: false,
  demoMode: false,       // true when operating without ORS API key
};

/* --- DOM Helper --- */
function $(id) {
  return document.getElementById(id);
}

/* --- Debounce --- */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* --- LRU Cache --- */
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const val = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, val);
    return val;
  }

  set(key, val) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, val);
  }
}

/* --- Formatters --- */
function formatDist(meters) {
  if (meters >= 1000) {
    return (meters / 1000).toFixed(1) + ' KM';
  }
  return Math.round(meters) + ' M';
}

function formatDur(seconds) {
  if (seconds < 60) return Math.round(seconds) + 'S';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return h + 'H ' + m + 'M';
  return m + ' MIN';
}

function formatDurShort(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  return '00:' + String(m).padStart(2, '0');
}

/* --- ETA arrival time string --- */
function formatArrivalTime(seconds) {
  const arrival = new Date(Date.now() + seconds * 1000);
  return arrival.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* --- Maneuver Icon Mapping --- */
function getManeuverIcon(instruction) {
  if (!instruction) return '↑';
  const text = instruction.toLowerCase();
  if (text.includes('depart')) return '◈';
  if (text.includes('arrive')) return '◉';
  if (text.includes('sharp left')) return '⟵';
  if (text.includes('sharp right')) return '⟶';
  if (text.includes('slight left') || text.includes('keep left')) return '↖';
  if (text.includes('slight right') || text.includes('keep right')) return '↗';
  if (text.includes('turn left')) return '↰';
  if (text.includes('turn right')) return '↱';
  if (text.includes('u-turn')) return '↩';
  if (text.includes('roundabout')) return '↺';
  if (text.includes('merge')) return '⤵';
  if (text.includes('straight') || text.includes('continue')) return '↑';
  return '↑';
}

/* --- Clock --- */
function updateClock() {
  const el = $('live-clock');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: false });
  }
}

/* --- Toast Notifications --- */
function showToast(msg, type = 'info', duration = 3000) {
  const container = $('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : type === 'warn' ? ' warn' : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* --- Update API Mode Badge in Bottom Bar --- */
function updateAPIBadge() {
  const el = $('bottom-api-mode');
  if (!el) return;
  if (S.demoMode) {
    el.textContent = 'DEMO';
    el.style.color = 'var(--cp-orange)';
  } else {
    el.textContent = 'ORS';
    el.style.color = 'var(--cp-cyan)';
  }
}

/* --- Polyline Decoder (ORS encoded polyline) --- */
function decodePolyline(encoded) {
  const coords = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

/* --- Distance between two [lat,lon] points (approx degrees) --- */
function coordDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/* --- Haversine distance in meters --- */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* --- Calculate bearing between two points --- */
function calcBearing(lat1, lon1, lat2, lon2) {
  const toRad = x => x * Math.PI / 180;
  const toDeg = x => x * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
