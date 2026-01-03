console.log("script running ✅");

mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];
const selectedModes = new Set(ALL_MODES);

// Where “context” becomes visible (dim) instead of hidden
const CONTEXT_START_ZOOM = 7;

// ---------- Helpers ----------
async function fetchJsonWithFallback(paths) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
      const json = await res.json();
      console.log("loaded ✅", p, "features:", json?.features?.length);
      return json;
    } catch (e) {
      console.warn("failed ❌", p, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

/**
 * Robust mode match that works whether `modes` is:
 * - an array
 * - a JSON string
 * - a comma-separated string
 *
 * We stringify modes and do substring match.
 */
function selectedModesExpr() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];

  const modesStr = ["downcase", ["to-string", ["get", "modes"]]];
  return ["any", ...modes.map(m => ["!=", ["index-of", m.toLowerCase(), modesStr], -1])];
}

/** Hub = mode_count >= 2 */
const hubExpr = [">=", ["to-number", ["get", "mode_count"]], 2];

/** Selected = matches the currently selected modes */
function selectedExpr() {
  return selectedModesExpr();
}

/** Selected hubs = hub AND selected */
function selectedHubExpr() {
  return ["all", hubExpr, selectedExpr()];
}

/** Selected non-hubs = NOT hub AND selected */
function selectedNonHubExpr() {
  return ["all", ["!", hubExpr], selectedExpr()];
}

/**
 * Context (non-selected) visibility:
 * - zoomed out: hidden
 * - zoomed in: dim
 *
 * IMPORTANT: This uses top-level interpolate (valid).
 */
function contextOpacityExpr() {
  // 0 opacity below CONTEXT_START_ZOOM, then 0.14 at high zoom.
  return [
    "interpolate", ["linear"], ["zoom"],
    CONTEXT_START_ZOOM - 0.01, 0.0,
    CONTEXT_START_ZOOM, 0.14,
    12, 0.16
  ];
}

/** Selected opacity: always strong */
function selectedOpacityExpr() {
  return [
    "interpolate", ["linear"], ["zoom"],
    2, 0.55,
    6, 0.78,
    9, 0.90,
    12, 0.95
  ];
}

/** Size scaling (stronger differentiation) */
function selectedRadiusExpr() {
  return [
    "interpolate", ["linear"], ["zoom"],
    2, 1.0,
    4, 1.6,
    6, 2.4,
    9, 4.2,
    12, 6.0
  ];
}

/** Hubs are the same size
function hubRadiusExpr() {
  return [
    "interpolate", ["linear"], ["zoom"],
   2, 1.0,
   4, 1.6,
   6, 2.4,
   9, 4.2,
   12, 6.0
  ];
}

// Apply filters after toggles change
function applyFilters() {
  if (map.getLayer("selected-nonhub")) {
    map.setFilter("selected-nonhub", selectedNonHubExpr());
    map.setPaintProperty("selected-nonhub", "circle-opacity", selectedOpacityExpr());
  }
  if (map.getLayer("selected-hub")) {
    map.setFilter("selected-hub", selectedHubExpr());
    map.setPaintProperty("selected-hub", "circle-opacity", selectedOpacityExpr());
  }
  if (map.getLayer("context-layer")) {
    // Context = everything NOT selected
    map.setFilter("context-layer", ["!", selectedExpr()]);
    map.setPaintProperty("context-layer", "circle-opacity", contextOpacityExpr());
  }
}

function wireToggleButtons() {
  const buttons = document.querySelectorAll(".toggles button");
  if (!buttons.length) {
    console.warn("No toggle buttons found. Check .toggles in index.html");
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      // Toggle UI
      btn.classList.toggle("active");

      // Toggle state
      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyFilters();
      console.log("selected modes:", Array.from(selectedModes));
    });
  });
}

// ---------- Main ----------
map.on("load", async () => {
  console.log("map loaded ✅");

  const data = await fetchJsonWithFallback([
    "data/facilities.geojson",
    "facilities.geojson"
  ]);

  map.addSource("facilities", { type: "geojson", data });

  // 1) Context layer (dim, only at higher zoom)
  map.addLayer({
    id: "context-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "rgba(255,255,255,0.55)",
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, 0.8,
        6, 1.4,
        9, 2.4,
        12, 3.6
      ],
      "circle-opacity": contextOpacityExpr(),
      "circle-stroke-width": 0.25,
      "circle-stroke-color": "rgba(255,255,255,0.10)"
    }
  });

  // 2) Selected non-hub layer (blue)
  map.addLayer({
    id: "selected-nonhub",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "#4da3ff",
      "circle-radius": selectedRadiusExpr(),
      "circle-opacity": selectedOpacityExpr(),
      "circle-stroke-width": 0.35,
      "circle-stroke-color": "rgba(255,255,255,0.18)"
    }
  });

  // 3) Selected hub layer (purple, bigger, on top)
  map.addLayer({
    id: "selected-hub",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "#b86bff",
      "circle-radius": hubRadiusExpr(),
      "circle-opacity": selectedOpacityExpr(),
      "circle-stroke-width": 0.45,
      "circle-stroke-color": "rgba(255,255,255,0.22)"
    }
  });

  // Fit bounds so dots are in view
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });

  // Wire UI + apply initial filters
  wireToggleButtons();
  applyFilters();

  console.log("setup complete ✅");
});
