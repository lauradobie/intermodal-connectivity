console.log("script running ✅");

// Mapbox token
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

const tooltip = document.getElementById("tooltip");

// Hybrid settings
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

// Try both locations so dots don't disappear when files move
async function fetchJsonWithFallback(paths) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(p);
      if (!res.ok) throw new Error(`${p} HTTP ${res.status}`);
      console.log(`loaded ✅ ${p}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.warn(`failed ❌ ${p}`, e);
    }
  }
  throw lastErr || new Error("All fetch attempts failed");
}

// Expression: feature matches any selected mode
function selectedExpression() {
  const modes = Array.from(selectedModes);
  if (modes.length === 0) return ["==", ["get", "id"], "__none__"];
  return ["any", ...modes.map(m => ["in", m, ["get", "modes"]])];
}

// Opacity: selected always visible. Non-selected hidden at low zoom, dim at high zoom.
function opacityExpression() {
  const isSelected = selectedExpression();

  const nonSelectedOpacity = [
    "case",
    [">=", ["zoom"], DIM_START_ZOOM],
    0.14, // dim when zoomed in
    0.0   // hidden when zoomed out
  ];

  return ["case", isSelected, 0.92, nonSelectedOpacity];
}

// Radius: small overall + noticeable bump for hubs (mode_count >= 2)
function radiusExpression() {
  const base = [
    "interpolate", ["linear"], ["zoom"],
    2, 0.9,
    4, 1.2,
    6, 1.7,
    9, 3.0,
    12, 4.6
  ];

  const hubBump = [
    "case",
    [">=", ["to-number", ["get", "mode_count"]], 2],
    ["interpolate", ["linear"], ["zoom"],
      2, 0.5,
      6, 1.0,
      9, 1.8,
      12, 2.4
    ],
    0
  ];

  return ["+", base, hubBump];
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

// ---- Tooltip wiring ----
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
        <div class="row"><div class="label">Modes</div><div class="value">${escapeHtml(modes.join(", ") || "—")}</div></div>
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

  let data;
  try {
    data = await fetchJsonWithFallback([
      "data/facilities.geojson",
      "facilities.geojson"
    ]);
  } catch (e) {
    console.error("🚨 Could not load facilities.geojson from either location.", e);
    alert("Could not load facilities.geojson. Check file location/path in your repo.");
    return;
  }

  console.log("feature count:", data.features?.length);

  map.addSource("facilities", { type: "geojson", data });

  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "#4da3ff",
      "circle-radius": radiusExpression(),
      "circle-opacity": opacityExpression(),
      "circle-stroke-width": 0.35,
      "circle-stroke-color": "rgba(255,255,255,0.18)"
    }
  });

  // Fit to bounds so dots are immediately in view
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
