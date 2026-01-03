console.log("script running ✅");

// 1) Mapbox token (public)
mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

// 2) Map setup
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// Modes available in your UI / data (note: your data uses "Bus", not "Transit")
const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];
const selectedModes = new Set(ALL_MODES);

// Tooltip element
const tooltip = document.getElementById("tooltip");

// --- Helpers ---
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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Hybrid visibility controls
// Below this zoom: hide non-selected completely (opacity 0)
// At/above this zoom: non-selected dims (opacity 0.12)
const DIM_START_ZOOM = 7;

function selectedExpression() {
  const modes = Array.from(selectedModes);
  // if nothing selected, treat as "show nothing" (you can change to show all)
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];
  return ["any", ...modes.map(m => ["in", m, ["get", "modes"]])];
}

function opacityExpression() {
  const isSelected = selectedExpression();

  // selected always visible
  const selectedOpacity = 0.88;

  // non-selected: 0 below DIM_START_ZOOM, else 0.12
  const nonSelectedOpacity = [
    "case",
    [">=", ["zoom"], DIM_START_ZOOM],
    0.12,
    0.0
  ];

  return ["case", isSelected, selectedOpacity, nonSelectedOpacity];
}

function applyHybridVisibility() {
  if (!map.getLayer("facilities-layer")) return;
  map.setPaintProperty("facilities-layer", "circle-opacity", opacityExpression());
}

// --- Toggle UI wiring ---
function wireToggleButtons() {
  document.querySelectorAll(".toggles button").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");

      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyHybridVisibility();
    });
  });
}

// --- Tooltip wiring ---
function buildModeChips(modesArr) {
  if (!Array.isArray(modesArr) || modesArr.length === 0) return "";
  return modesArr.map(m => `<span class="chip">${escapeHtml(m)}</span>`).join("");
}

function wireTooltip() {
  if (!tooltip) return;

  map.on("mousemove", "facilities-layer", (e) => {
    const f = e.features && e.features[0];
    if (!f) return;

    // If hovering a non-selected point at low zoom, it shouldn't be visible anyway
    map.getCanvas().style.cursor = "pointer";

    const p = f.properties || {};
    const name = escapeHtml(p.name ?? "Facility");

    const state = escapeHtml(p.state ?? "—");
    const region = escapeHtml(p.region ?? "—");
    const urban = escapeHtml(p.urban_rural ?? "—");

    const modes = normalizeModes(p.modes);
    const chips = buildModeChips(modes);

    const modeCount = escapeHtml(p.mode_count ?? "—");
    const score = escapeHtml(p.connectivity_score ?? "—");

    // Editorial “summary” line
    const summary =
      Number(p.mode_count) >= 2
        ? `${modeCount}-mode intermodal hub`
        : `Single-mode facility`;

    tooltip.style.display = "block";
    tooltip.style.left = `${e.point.x + 12}px`;
    tooltip.style.top = `${e.point.y + 12}px`;

    tooltip.innerHTML = `
      <div class="t-title">${name}</div>
      <div class="t-loc">${state} • ${region} • ${urban}</div>

      <div class="chips">${chips}</div>

      <div class="divider"></div>

      <div class="rows">
        <div class="row"><div class="label">Summary</div><div class="value">${escapeHtml(summary)}</div></div>
        <div class="row"><div class="label">Mode count</div><div class="value">${modeCount}</div></div>
        <div class="row"><div class="label">Score</div><div class="value">${score}</div></div>
      </div>
    `;
  });

  map.on("mouseleave", "facilities-layer", () => {
    map.getCanvas().style.cursor = "";
    tooltip.style.display = "none";
  });
}

// --- Main load ---
map.on("load", async () => {
  console.log("map loaded ✅");

  const res = await fetch("data/facilities.geojson");
  if (!res.ok) throw new Error(`facilities.geojson HTTP ${res.status}`);
  const data = await res.json();
  console.log("feature count:", data.features?.length);

  map.addSource("facilities", { type: "geojson", data });

  // Single neutral color (selected vs not is handled by opacity)
  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      // smaller dots to reduce overlap, zoom-aware
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        2, 0.8,
        4, 1.2,
        6, 1.8,
        9, 3.2,
        12, 5.0
      ],
      "circle-color": "#4da3ff",
      "circle-opacity": opacityExpression(),
      "circle-stroke-width": 0.4,
      "circle-stroke-color": "rgba(255,255,255,0.20)"
    }
  });

  // Fly to data bounds on load (cinematic settle)
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });

  wireToggleButtons();
  wireTooltip();
  applyHybridVisibility();

  console.log("setup complete ✅");
});
