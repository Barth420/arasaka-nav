/* ============================================================
   ARASAKA NAV — Geocoding (Nominatim)
   Search, reverse geocode, input handlers, result rendering
   Mumbai / India focused with viewbox bias
   ============================================================ */

const geoCache = new LRUCache(50);

// Mumbai viewbox for search result biasing (SW corner, NE corner)
const MUMBAI_VIEWBOX = '72.7760,18.8927,73.0000,19.2710';

const NOMINATIM_HEADERS = {
  'Accept-Language': 'en-IN,en',
};

/* --- Forward Geocode Search --- */
async function geocodeSearch(query) {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = 'fwd:' + query.toLowerCase().trim();
  const cached = geoCache.get(cacheKey);
  if (cached) return cached;

  try {
    // India-scoped search with Mumbai viewbox bias
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&countrycodes=in&viewbox=${MUMBAI_VIEWBOX}&bounded=0`;
    const resp = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!resp.ok) throw new Error('Nominatim ' + resp.status);
    const data = await resp.json();
    geoCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error('Geocode search failed:', err);
    showToast('SEARCH FAILED — CHECK NETWORK', 'error');
    return [];
  }
}

/* --- Reverse Geocode --- */
async function reverseGeocode(lat, lon) {
  const cacheKey = `rev:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = geoCache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16`;
    const resp = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!resp.ok) throw new Error('Reverse geocode ' + resp.status);
    const data = await resp.json();
    geoCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error('Reverse geocode failed:', err);
    return null;
  }
}

/* --- Render Search Results Dropdown --- */
function renderSearchResults(results, dropdownEl) {
  dropdownEl.innerHTML = '';
  if (!results || results.length === 0) {
    dropdownEl.classList.remove('active');
    return;
  }

  results.forEach(r => {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    const parts = r.display_name.split(',');
    const name  = parts[0].trim();
    const addr  = parts.slice(1, 4).map(s => s.trim()).join(', ');

    item.innerHTML = `
      <div class="result-name">${name}</div>
      <div class="result-addr">${addr}</div>
    `;

    item.dataset.lat  = r.lat;
    item.dataset.lon  = r.lon;
    item.dataset.name = r.display_name;

    dropdownEl.appendChild(item);
  });

  dropdownEl.classList.add('active');
}

/* --- Setup Search Input with Debounce --- */
function setupSearchInput(inputId, dropdownId, type) {
  const input    = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;

  const doSearch = debounce(async (query) => {
    if (query.length < 2) {
      dropdown.classList.remove('active');
      return;
    }
    const results = await geocodeSearch(query);
    renderSearchResults(results, dropdown);
  }, 400);

  input.addEventListener('input', (e) => doSearch(e.target.value));

  input.addEventListener('focus', () => {
    if (dropdown.children.length > 0) dropdown.classList.add('active');
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (!item) return;

    const lat       = parseFloat(item.dataset.lat);
    const lon       = parseFloat(item.dataset.lon);
    const name      = item.dataset.name;
    const shortName = name.split(',')[0].trim();

    input.value = shortName;
    dropdown.classList.remove('active');

    if (type === 'origin') {
      S.originCoords = [lat, lon];
      S.originName   = shortName;
      setOriginMarker(lat, lon);
    } else {
      S.destCoords = [lat, lon];
      S.destName   = shortName;
      setDestMarker(lat, lon);
    }

    if (S.originCoords && S.destCoords) {
      fetchRoutes(S.originCoords, S.destCoords);
    }

    S.map.setView([lat, lon], 14);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-row')) dropdown.classList.remove('active');
  });
}
