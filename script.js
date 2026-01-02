console.log("script loaded ✅");

// 1) Paste your Mapbox token here
mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

// 2) Map setup
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// 3) Selected modes (multi-select)
const selectedModes = new Set(["Air", "Rail", "Transit", "Ferry", "Bike"]);

// Tooltip element
const tooltip = document.getElementById("tooltip");

// Update map filter based on selected modes
function updateFilter() {
  const modes = Array.from(selectedModes);

  // Matches if ANY selected mode exists in properties.modes array
  const filter = modes.length
    ? ["any", ...modes.map(m => ["in", m, ["get", "modes"]])]
    : ["==", ["get", "id"], "__none__"];

  map.setFilter("facilities-layer", filter);
}

// Load headline number
async function loadMetrics() {
  try {
    const res = await fetch("data/metrics.json");
    const m = await res.json();
    const pct = m?.overall?.true_intermodal_pct;
    document.getElementById("headline-value").textContent =
      (pct !== undefined && pct !== null) ? `${pct}%` : "—";
  } catch {
    document.getElementById("headline-value").textContent = "—";
  }
}

map.on("load", async () => {
  await loadMetrics();

  // Load facilities GeoJSON
  const res = await fetch("data/facilities.geojson");
  const data = await res.json();

  map.addSource("facilities", { type: "geojson", data });

  // Layer
  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        3, 1.5,
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

  updateFilter();

  // Cursor + tooltip
  map.on("mousemove", "facilities-layer", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];
    if (!f) return;

    const p = f.properties;

    // p.modes may arrive as a string depending on GeoJSON writer; try to parse safely
    let modes = p.modes;
    try {
      if (typeof modes === "string" && modes.startsWith("[")) modes = JSON.parse(modes);
    } catch {}

    const modesText = Array.isArray(modes) ? modes.join(", ") : String(modes ?? "");

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
});

// Toggle button logic
document.querySelectorAll(".toggles button").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    btn.classList.toggle("active");

    if (selectedModes.has(mode)) selectedModes.delete(mode);
    else selectedModes.add(mode);

    updateFilter();
  });
});
