console.log("script running ✅");

mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// --- Modes you want to support in UI ---
const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];

// Multi-select state
const selectedModes = new Set(ALL_MODES);

// Tooltip (optional; safe if missing)
const tooltip = document.getElementById("tooltip");

// Safely parse modes if it comes through as string
function normalizeModes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[")) {
      try { return JSON.parse(s); } catch {}
    }
    // fallback: split on commas
    if (s.includes(",")) return s.split(",").map(x => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

// Compute a dim factor: 1 if matches selected, else 0.12
function dimExpression() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return 0.12;

  // If feature has ANY selected mode => opacity 0.85, else 0.10
  return [
    "case",
    ["any", ...modes.map(m => ["in", m, ["get", "modes"]])],
    0.85,
    0.10
  ];
}

// Update layer paint (dim vs highlight)
function applyDim() {
  if (!map.getLayer("facilities-layer")) return;
  map.setPaintProperty("facilities-layer", "circle-opacity", dimExpression());
  updateMetricFromSelection();
}

// Update headline metric based on current selection
function updateMetricFromSelection() {
  const el = document.getElementById("headline-value");
  if (!el || !window.__FACILITY_DATA__) return;

  const features = window.__FACILITY_DATA__.features || [];
  const modes = Array.from(selectedModes);

  // consider a facility "active" if it matches ANY selected mode
  const isActive = (f) => {
    const m = normalizeModes(f.properties?.modes);
    return modes.length ? m.some(x => modes.includes(x)) : false;
  };

  // "Truly intermodal" = mode_count >= 2 (you can change to >=3 if you want stricter)
  const active = features.filter(isActive);
  const truly = active.filter(f => Number(f.properties?.mode_count) >= 2);

  const pct = active.length ? Math.round((truly.length / active.length) * 100) : 0;
  el.textContent = `${pct}%`;
}

// Toggle button logic (multi-select)
function wireToggleButtons() {
  document.querySelectorAll(".toggles button").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");

      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyDim();
    });
  });
}

// Tooltip hover
function wireTooltip() {
  if (!tooltip) return;

  map.on("mousemove", "facilities-layer", (e) => {
    map.getCanvas().style.cursor = "pointer";
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties || {};

    const modes = normalizeModes(p.modes).join(", ") || "—";

    tooltip.style.display = "block";
    tooltip.style.left = `${e.point.x + 12}px`;
    tooltip.style.top = `${e.point.y + 12}px`;
    tooltip.innerHTML = `
      <div class="t-title">${p.name ?? "Facility"}</div>
      <div class="t-row"><div class="t-label">Modes</div><div>${modes}</div></div>
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

map.on("load", async () => {
  console.log("map loaded ✅");

  // Load GeoJSON
  const res = await fetch("data/facilities.geojson");
  if (!res.ok) throw new Error(`facilities.geojson HTTP ${res.status}`);
  const data = await res.json();
  window.__FACILITY_DATA__ = data;

  map.addSource("facilities", { type: "geojson", data });

  // Smaller dots + zoom-aware sizing
  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, 1.0,
        4, 1.6,
        6, 2.4,
        9, 4.2,
        12, 6.0
      ],
      "circle-color": [
        "interpolate", ["linear"], ["get", "mode_count"],
        1, "#4da3ff",
        2, "#8b5cf6",
        3, "#22c55e",
        4, "#facc15"
      ],
      "circle-opacity": dimExpression(),
      "circle-stroke-width": 0.5,
      "circle-stroke-color": "rgba(255,255,255,0.22)"
    }
  });

  // Zoom to data bounds (fast cinematic settle)
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, duration: 900 });

  wireToggleButtons();
  wireTooltip();
  updateMetricFromSelection();

  console.log("setup complete ✅");
});
