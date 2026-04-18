# ARASAKA NAV 

> **A Cyberpunk 2077-inspired tactical navigation system for Mumbai, India**

A fully client-side web application that delivers turn-by-turn navigation with a dark, high-contrast HUD aesthetic inspired by the Arasaka corporation's tactical systems from Cyberpunk 2077. Built with vanilla JavaScript and Leaflet.js — no build tools, no frameworks.

---

##  Features

| Feature | Details |
|---------|---------|
|  **Live Map** | CartoDB Dark Matter tiles via Leaflet.js |
|  **Location Search** | Nominatim geocoder with Mumbai-area bias |
|  **Marker Placement** | Click map or search to set origin & destination |
|  **Turn-by-Turn Routing** | Via OpenRouteService API (live) or built-in demo mode |
|  **3 Route Variants** | Fastest / Recommended / Shortest with ETA & arrival time |
|  **Traffic Coloring** | Per-segment color overlay (free / moderate / heavy) |
|  **Navigation HUD** | Maneuver icon, distance, road name, next instruction, ETA |
|  **Simulation Mode** | Animated vehicle drives the route with live speed display |
|  **POI System** | Hospitals, food, fuel, police markers via Overpass API |
|  **Night Mode+** | Extra darkened tile filter |
|  **Keyboard Shortcuts** | ESC, ← →, S, L, R |
|  **Demo Mode** | Full UI experience without any API key |

---

##  Getting Started

### Option A — Demo Mode (no API key needed)
1. Clone or download this repository
2. Open `index.html` in any modern browser
3. Click **DEMO MODE** on the startup screen
4. Click two points on the Mumbai map to set origin and destination
5. A route line will appear — click **BEGIN NAVIGATION** and then **SIM** to simulate the drive

### Option B — Live Routing (OpenRouteService)
1. Get a free API key at [openrouteservice.org](https://openrouteservice.org/dev/#/signup) (no credit card, 2,000 requests/day)
2. Open `index.html`, paste your key into the startup modal
3. Search for any location in Mumbai/India and start navigating

> **No server required.** The app runs entirely in the browser using public APIs.

---

##  Controls

| Input | Action |
|-------|--------|
| **Click map** | Place origin → then destination |
| **Drag marker** | Reposition marker and re-route |
| **⇅ button** | Swap origin and destination |
| `ESC` | Stop navigation / clear all |
| `← →` | Previous / next step |
| `S` | Toggle simulation |
| `L` | Toggle left panel |
| `R` | Toggle right panel |

---

##  Tech Stack

| Technology | Role |
|-----------|------|
| [Leaflet.js 1.9.4](https://leafletjs.com/) | Interactive map engine |
| [CartoDB Dark Matter](https://carto.com/basemaps/) | Dark map tiles |
| [Nominatim / OSM](https://nominatim.org/) | Geocoding & reverse geocoding |
| [OpenRouteService](https://openrouteservice.org/) | Turn-by-turn routing (live mode) |
| [Overpass API](https://overpass-api.de/) | Points of interest |
| Vanilla JS / CSS | No framework dependencies |
| Orbitron, Rajdhani, Share Tech Mono | Google Fonts |

---

##  Project Structure

```
arasaka-nav/
├── index.html          # Main application shell
├── css/
│   ├── base.css        # Design tokens, animations, typography
│   ├── layout.css      # 5-zone grid layout (topbar/panels/map/bottombar)
│   ├── components.css  # Markers, cards, HUD, modal, toasts
│   └── map.css         # Leaflet overrides, POI markers, tile filter
├── js/
│   ├── utils.js        # Global state, formatters, helpers
│   ├── geocode.js      # Nominatim search & reverse geocode
│   ├── map.js          # Leaflet init, marker management, map events
│   ├── routing.js      # ORS routing + mock route generator
│   ├── navigation.js   # Turn-by-turn, HUD, simulation
│   ├── poi.js          # Overpass API POI system
│   └── app.js          # Boot sequence, event wiring, modal flow
├── README.md
└── LICENSE
```

---

##  Design Language

- **Color palette**: CP2077-authentic — `#FCEE09` yellow, `#00F5FF` cyan, `#FF3D3D` red, `#39FF14` neon green
- **Typography**: Orbitron (HUD/values), Rajdhani (UI labels), Share Tech Mono (coords/data)
- **Geometry**: Cut-corner clip-paths for all panels and buttons
- **Animations**: Glitch title, pulsing diamond markers, scanline overlay, boot sequence flicker
- **Route line**: Triple-layer glow polyline (outer haze → mid glow → sharp core)

---

##  License

MIT — see [LICENSE](LICENSE)

---

##  Credits

Map data © [OpenStreetMap](https://openstreetmap.org/copyright) contributors  
Tiles © [CARTO](https://carto.com/)  
Routing © [OpenRouteService](https://openrouteservice.org/)  
POI data © [OpenStreetMap](https://openstreetmap.org/) via Overpass API
