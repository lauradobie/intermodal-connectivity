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

// 3) Selected modes (multi-select) — match your data (Bus, not Transit)
const selectedModes = new Set(["Air", "Rail", "Bus", "Ferry", "Bike"]);

// 4) Tooltip element (safe if missing)
const tooltip = document.getElementById("tooltip");

// Helper: safely parse modes if it arrives as string
function normalizeModes(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[")) {
      try { return JSON.parse(s); } catch {}
    }
    if (s.includes(",")) return s.split(",").map(x => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

// 5) Dim vs highlight expression based on selected modes
function dimExpression() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return 0.10;

  return [
    "case",
    ["any", ...modes.map(m => ["in", m, ["get", "modes"]])],
    0.85, // highlighted
    0.10  // dimmed
  ];
}

// 6) Apply dimming (doesn't hide)
function applyDim() {
  if (!map.getLayer("facilities-layer")) return;
  map.setPaintProperty("facilities-layer", "circle-opacity", dimExpression());
}

// 7) Load metrics (headline)
async function loadMetrics() {
  const el = document.getElementById("headline-value");
  if (!el) return;

  try {
    const res = await fetch("data/metrics.json");
    if (!res.ok) throw new Error(`metrics.json HTTP ${res.status}`);
    const m = await res.json();

    const pct = m?.overall?.true_intermodal_pct;
    el.textContent = (pct !== undefined && pct !== null) ? `${pct}%` : "—";
  } catch (e) {
    console.warn("metrics load failed:", e);
    el.textContent = "—";
  }
}

// 8) Wire toggle buttons (multi-select)
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

// 9) Tooltip hover
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

// 10) Main load: add data + layer
map.on("load", async () => {
  console.log("map loaded ✅");
  await loadMetrics();

  const res = await fetch("data/facilities.geojson");
  if (!res.ok) throw new Error(`facilities.geojson HTTP ${res.status}`);
  const data = await res.json();
  console.log("features:", data.features?.length);

  map.addSource("facilities", { type: "geojson", data });

  // Smaller dots (zoom-aware)
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

  // Zoom to data bounds so you see dots immediately
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 50, duration: 900 });

  wireToggleButtons();
  wireTooltip();
  applyDim();

  console.log("setup complete ✅");
});
