console.log("script running ✅");

mapboxgl.accessToken =
  "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];
const selectedModes = new Set(ALL_MODES);

// When context starts showing (you can raise/lower this)
const CONTEXT_START_ZOOM = 7;

// “Ink” color close to the map background (NOT white, NOT transparent)
const CONTEXT_INK = "#141922"; // tweak darker/lighter if you want

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

function selectedModesExpr() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];

  const modesStr = ["downcase", ["to-string", ["get", "modes"]]];
  return [
    "any",
    ...modes.map(m => ["!=", ["index-of", m.toLowerCase(), modesStr], -1])
  ];
}

const hubExpr = [">=", ["to-number", ["get", "mode_count"]], 2];

function selectedExpr() {
  return selectedModesExpr();
}

function selectedHubExpr() {
  return ["all", hubExpr, selectedExpr()];
}

function selectedNonHubExpr() {
  return ["all", ["!", hubExpr], selectedExpr()];
}

/**
 * Context visibility:
 * - Hidden below CONTEXT_START_ZOOM
 * - Fully opaque above it
 *
 * IMPORTANT: opacity here is 0 or 1 only (no stacking brightness).
 */
function contextOpacityExpr() {
  return [
    "step",
    ["zoom"],
    0, // invisible by default
    CONTEXT_START_ZOOM,
    1 // fully visible when zoomed in
  ];
}

function selectedOpacityExpr() {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2, 0.60,
    6, 0.82,
    9, 0.92,
    12, 0.96
  ];
}

function selectedRadiusExpr() {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2, 1.0,
    4, 1.6,
    6, 2.4,
    9, 4.2,
    12, 6.0
  ];
}

// If you want hubs same size as others, keep these numbers identical:
function hubRadiusExpr() {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    2, 1.0,
    4, 1.6,
    6, 2.4,
    9, 4.2,
    12, 6.0
  ];
}

function applyFilters() {
  if (map.getLayer("selected-nonhub")) {
    map.setFilter("selected-nonhub", selectedNonHubExpr());
  }
  if (map.getLayer("selected-hub")) {
    map.setFilter("selected-hub", selectedHubExpr());
  }
  if (map.getLayer("context-layer")) {
    // Context = everything NOT selected
    map.setFilter("context-layer", ["!", selectedExpr()]);
  }
}

function wireToggleButtons() {
  const buttons = document.querySelectorAll(".toggles button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");
      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyFilters();
      console.log("selected modes:", Array.from(selectedModes));
    });
  });
}

map.on("load", async () => {
  console.log("map loaded ✅");

  const data = await fetchJsonWithFallback([
    "data/facilities.geojson",
    "facilities.geojson"
  ]);

  map.addSource("facilities", { type: "geojson", data });

  // 1) Context layer (FAKE-OPAQUE INK — no additive brightness)
  map.addLayer({
    id: "context-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": CONTEXT_INK,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        2, 0.8,
        6, 1.2,
        9, 1.8,
        12, 2.6
      ],
      "circle-opacity": contextOpacityExpr(),
      "circle-stroke-width": 0 // strokes make stacks brighter; keep off
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

  // 3) Selected hub layer (purple, same size unless you change hubRadiusExpr)
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

  // Fit bounds
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of data.features || []) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });

  wireToggleButtons();
  applyFilters();

  console.log("setup complete ✅");
});
