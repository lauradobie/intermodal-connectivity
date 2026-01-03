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

// Context behavior
const CONTEXT_START_ZOOM = 7;
const CONTEXT_INK = "#141922"; // near-basemap “ink” (no additive brightness)

async function fetchJsonWithFallback(paths) {
  let lastErr;
  for (const p of paths) {
    try {
      console.log("Trying:", p);
      const res = await fetch(p);
      if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
      const json = await res.json();
      console.log("Loaded ✅", p, "features:", json?.features?.length);
      return json;
    } catch (e) {
      console.warn("Failed ❌", p, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

function selectedModesExpr() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];

  const modesStr = ["downcase", ["to-string", ["get", "modes"]]];
  return ["any", ...modes.map(m => ["!=", ["index-of", m.toLowerCase(), modesStr], -1])];
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

// Hide context until zoomed in, then fully visible (no opacity stacking)
function contextOpacityExpr() {
  return ["step", ["zoom"], 0, CONTEXT_START_ZOOM, 1];
}

function selectedOpacityExpr() {
  return ["interpolate", ["linear"], ["zoom"], 2, 0.65, 6, 0.85, 9, 0.92, 12, 0.96];
}

function selectedRadiusExpr() {
  return ["interpolate", ["linear"], ["zoom"], 2, 1.0, 4, 1.6, 6, 2.4, 9, 4.2, 12, 6.0];
}

// hubs same size as others (per your ask)
function hubRadiusExpr() {
  return ["interpolate", ["linear"], ["zoom"], 2, 1.0, 4, 1.6, 6, 2.4, 9, 4.2, 12, 6.0];
}

function applyFilters() {
  if (map.getLayer("selected-nonhub")) map.setFilter("selected-nonhub", selectedNonHubExpr());
  if (map.getLayer("selected-hub")) map.setFilter("selected-hub", selectedHubExpr());
  if (map.getLayer("context-layer")) map.setFilter("context-layer", ["!", selectedExpr()]);
}

function wireToggleButtons() {
  const buttons = document.querySelectorAll(".toggles button");
  if (!buttons.length) {
    console.warn("No toggle buttons found (expected .toggles button)");
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");
      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyFilters();
    });
  });
}

map.on("load", async () => {
  try {
    console.log("map loaded ✅");

    const data = await fetchJsonWithFallback([
      "data/facilities.geojson",
      "facilities.geojson"
    ]);

    map.addSource("facilities", { type: "geojson", data });

    // Context (non-selected): fake-opaque ink (no strokes; strokes brighten with overlap)
    map.addLayer({
      id: "context-layer",
      type: "circle",
      source: "facilities",
      paint: {
        "circle-color": CONTEXT_INK,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 0.8, 6, 1.2, 9, 1.8, 12, 2.6],
        "circle-opacity": contextOpacityExpr(),
        "circle-stroke-width": 0
      }
    });

    // Selected non-hubs (blue)
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

    // Selected hubs (purple, same size)
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

    // Fit bounds safely
    const bounds = new mapboxgl.LngLatBounds();
    let added = 0;
    for (const f of (data.features || [])) {
      const c = f?.geometry?.coordinates;
      if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        bounds.extend(c);
        added++;
      }
    }
    if (added > 0 && !bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 800 });

    wireToggleButtons();
    applyFilters();

    console.log("setup complete ✅");
  } catch (err) {
    console.error("🚨 setup failed:", err);
    alert("Map loaded, but setup failed. Open DevTools → Console to see the error.");
  }
});
