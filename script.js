console.log("script running ✅");

// ✅ 1) Paste your Mapbox public token here (starts with pk.)
mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

// ✅ 2) Create the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// ✅ 3) UI state: selected modes (multi-select)
const selectedModes = new Set(["Air", "Rail", "Bus", "Ferry", "Bike"]);

// ✅ 4) Tooltip element
const tooltip = document.getElementById("tooltip");

// ✅ 5) Load headline metric
async function loadMetrics() {
  try {
    const res = await fetch("data/metrics.json");
    if (!res.ok) throw new Error(`metrics.json HTTP ${res.status}`);
    const m = await res.json();

    // metrics.json structure: { overall: { true_intermodal_pct: ... } }
    const pct = m?.overall?.true_intermodal_pct;

    const el = document.getElementById("headline-value");
    if (el) el.textContent = (pct !== undefined && pct !== null) ? `${pct}%` : "—";
  } catch (err) {
    console.warn("metrics load failed:", err);
    const el = document.getElementById("headline-value");
    if (el) el.textContent = "—";
  }
}

// ✅ 6) Update map filter based on selected modes
function updateFilter() {
  // If the layer isn't added yet, skip
  if (!map.getLayer("facilities-layer")) return;

  const modes = Array.from(selectedModes);

  // Match if ANY selected mode is in the feature's modes array
  const filter = modes.length
    ? ["any", ...modes.map(m => ["in", m, ["get", "modes"]])]
    : ["==", ["get", "id"], "__none__"];

  map.setFilter("facilities-layer", filter);
}

// ✅ 7) Toggle button setup
function wireToggleButtons() {
  const buttons = document.querySelectorAll(".toggles button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");

      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      updateFilter();
    });
  });
}

// ✅ 8) Tooltip behavior
function wireTooltip() {
  map.on("mousemove", "facilities-layer", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features && e.features[0];
    if (!f) return;

    const p = f.properties || {};

    // modes is an array in your GeoJSON (best case). But sometimes it arrives as a string.
    let modes = p.modes;
    try {
      if (typeof modes === "string" && modes.trim().startsWith("[")) {
        modes = JSON.parse(modes);
      }
    } catch (_) {}

    const modesText = Array.isArray(modes) ? modes.join(", ") : String(modes ?? "—");

    tooltip.style.display = "block";
    tooltip.style.left = `${e.point.x + 12}px`;
    tooltip.style.top = `${e.point.y + 12}px`;

    tooltip.innerHTML = `
      <div class="t-title">${p.name ?? "Facility"}</div>
      <div class="t-row"><div class="t-label">Modes</div><div>${modesText}</div></div>
      <div class="t-row"><div class="t-label">Score</div><div>${p.connectivity_score ?? "—"}</div></div>
      <div class="t-row"><div class="t-label">Region</div><div>${p.region ?? "—"}</div></div>
      <div class="t-row"><div class="t-label">Area type</div><div>${p.urban_rural ?? "—"}</div></div>
    `;
  });

  map.on("mouseleave", "facilities-layer", () => {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  });
}

// ✅ 9) Main load: metrics + GeoJSON + layers
map.on("load", async () => {
  console.log("map loaded ✅");

  // Load headline number
  await loadMetrics();

  // Fetch GeoJSON
  const res = await fetch("data/facilities.geojson");
  console.log("facilities.geojson status:", res.status);

  if (!res.ok) {
    throw new Error(`facilities.geojson HTTP ${res.status}`);
  }

  const data = await res.json();
  console.log("feature count:", data.features?.length);

  // Add source
  map.addSource("facilities", { type: "geojson", data });

  // Add dots layer (visible + scalable)
  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        3, 2,
        6, 4,
        9, 7,
        12, 11
      ],
      "circle-color": [
        "interpolate", ["linear"], ["get", "mode_count"],
        1, "#4da3ff",
        2, "#8b5cf6",
        3, "#22c55e",
        4, "#facc15"
      ],
      "circle-opacity": 0.82,
      "circle-stroke-width": 0.6,
      "circle-stroke-color": "rgba(255,255,255,0.25)"
    }
  });

  // Zoom to data bounds so you see dots immediately
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, duration: 800 });
  }

  // Wire interactions
  wireToggleButtons();
  wireTooltip();

  // Apply initial filter
  updateFilter();

  console.log("setup complete ✅");
});
