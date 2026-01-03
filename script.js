console.log("script running ✅");

// Mapbox token (public)
mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

// Your dataset uses "Bus" (not "Transit")
const ALL_MODES = ["Air", "Rail", "Bus", "Ferry", "Bike"];
const selectedModes = new Set(ALL_MODES);

// Tooltip element
const tooltip = document.getElementById("tooltip");

// Hybrid rule:
// - below this zoom: non-selected are hidden (opacity 0)
// - at/above this zoom: non-selected are dim (opacity 0.12)
const DIM_START_ZOOM = 7;

// ---- Helpers ----
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

// Expression: true if feature matches ANY selected mode
function selectedExpression() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];
  return ["any", ...modes.map(m => ["in", m, ["get", "modes"]])];
}

// Opacity: selected always visible; non-selected hidden at low zoom, dim at high zoom
function opacityExpression() {
  const isSelected = selectedExpression();

  const nonSelectedOpacity = [
    "case",
    [">=", ["zoom"], DIM_START_ZOOM],
    0.12, // dim when zoomed in
    0.0   // hidden when zoomed out
  ];

  return ["case", isSelected, 0.9, nonSelectedOpacity];
}

// Radius: smaller overall + bump hubs (mode_count >= 2)
function radiusExpression() {
  // base radius by zoom (small)
  const base = [
    "interpolate", ["linear"], ["zoom"],
    2, 0.8,
    4, 1.1,
    6, 1.6,
    9, 2.8,
    12, 4.2
  ];

  // bump for hubs (2+ modes). Small but noticeable.
  const bump = [
    "case",
    [">=", ["to-number", ["get", "mode_count"]], 2],
    ["interpolate", ["linear"], ["zoom"],
      2, 0.2,
      6, 0.6,
      9, 1.2,
      12, 1.8
    ],
    0
  ];

  return ["+", base, bump];
}

function applyHybrid() {
  if (!map.getLayer("facilities-layer")) return;
  map.setPaintProperty("facilities-layer", "circle-opacity", opacityExpression());
}

// ---- Toggle wiring ----
function wireToggleButtons() {
  document.querySelectorAll(".toggles button").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode) return;

      btn.classList.toggle("active");

      if (selectedModes.has(mode)) selectedModes.delete(mode);
      else selectedModes.add(mode);

      applyHybrid();
    });
  });
}

// ---- Tooltip wiring (clear hierarchy + chips + extra info) ----
function buildModeChips(modesArr) {
  if (!Array.isArray(modesArr) || modesArr.length === 0) return "";
  return modesArr.map(m => `<span class="chip">${escapeHtml(m)}</span>`).join("");
}

function wireTooltip() {
  if (!tooltip) return;

  map.on("mousemove", "facilities-layer", (e) => {
    const f = e.features && e.features[0];
    if (!f) return;

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

    const summary =
      Number(p.mode_count) >= 2
        ? `${modeCount}-mode intermodal hub`
        : "Single-mode facility";

    // Optional: a slightly more narrative line
    const nuance =
      (p.urban_rural === "Non-CBSA")
        ? "Outside metro areas (Non-CBSA)"
        : (p.urban_rural ? `Located in a ${escapeHtml(p.urban_rural)} area` : "");

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
        ${nuance ? `<div class="row"><div class="label">Context</div><div class="value">${escapeHtml(nuance)}</div></div>` : ""}
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

// ---- Main load ----
map.on("load", async () => {
  console.log("map loaded ✅");

  const res = await fetch("data/facilities.geojson");
  if (!res.ok) throw new Error(`facilities.geojson HTTP ${res.status}`);
  const data = await res.json();
  console.log("feature count:", data.features?.length);

  map.addSource("facilities", { type: "geojson", data });

  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      // One color (selected vs context handled by opacity)
      "circle-color": "#4da3ff",

      // Smaller overall + hub bump
      "circle-radius": radiusExpression(),

      // Hybrid hide/dim behavior
      "circle-opacity": opacityExpression(),

      "circle-stroke-width": 0.4,
      "circle-stroke-color": "rgba(255,255,255,0.20)"
    }
  });

  // Fly to data bounds (cinematic settle)
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of (data.features || [])) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, duration: 900 });

  wireToggleButtons();
  wireTooltip();
  applyHybrid();

  console.log("setup complete ✅");
});
