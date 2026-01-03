console.log("script running ✅");

// 1) Mapbox token
mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

// 2) Map setup
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});
map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// 3) Modes
const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];
const selectedModes = new Set(ALL_MODES);

// 4) Tooltip (optional—won’t break if missing)
const tooltip = document.getElementById("tooltip");

// ---------- Helpers ----------
async function fetchJsonWithFallback(paths) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
      const json = await res.json();
      console.log("loaded ✅", p);
      return json;
    } catch (e) {
      console.warn("failed ❌", p, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

// Robust mode match that works whether `modes` is an array OR a string.
// We stringify and check substring membership.
function selectedFilterExpression() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];

  const modesStr = ["downcase", ["to-string", ["get", "modes"]]];
  return [
    "any",
    ...modes.map(m => ["!=", ["index-of", m.toLowerCase(), modesStr], -1])
  ];
}

function applyFilter() {
  if (!map.getLayer("facilities-layer")) return;
  map.setFilter("facilities-layer", selectedFilterExpression());
}

// VALID zoom-based radius (interpolate is top-level)
function radiusExpr() {
  const base = [
    "interpolate", ["linear"], ["zoom"],
    2, 0.8,
    4, 1.1,
    6, 1.6,
    9, 2.8,
    12, 4.2
  ];

  // Hubs (2+ modes) get bigger
  const bump = [
    "case",
    [">=", ["to-number", ["get", "mode_count"]], 2],
    ["interpolate", ["linear"], ["zoom"],
      2, 0.6,
      6, 1.0,
      9, 1.7,
      12, 2.2
    ],
    0
  ];

  return ["+", base, bump];
}

// VALID zoom-based opacity (interpolate is top-level)
// This makes points visible overall while still letting you “feel” density:
// - At low zoom: points are faint but present
// - At higher zoom: stronger
function opacityExpr() {
  return [
    "interpolate", ["linear"], ["zoom"],
    2, 0.18,
    4, 0.28,
    6, 0.45,
    9, 0.78,
    12, 0.92
  ];
}

// ---------- UI wiring ----------
function wireToggleButtons() {
  document.querySelectorAll(".toggles button").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");
      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyFilter();
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

  console.log("feature count:", data?.features?.length);

  map.addSource("facilities", { type: "geojson", data });

  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "#4da3ff",
      "circle-radius": radiusExpr(),
      "circle-opacity": opacityExpr(),
      "circle-stroke-width": 0.35,
      "circle-stroke-color": "rgba(255,255,255,0.18)"
    }
  });

  // Start with all selected
  applyFilter();
  wireToggleButtons();

  // Fit to bounds so you definitely land on the data
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });

  console.log("setup complete ✅");
});
