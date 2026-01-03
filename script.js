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

// 4) Tooltip element
const tooltip = document.getElementById("tooltip");

// 5) Helper: update layer filter based on selected modes
function updateFilter() {
  const modes = Array.from(selectedModes);

  // This assumes your GeoJSON properties include:
  // properties.modes = ["Air","Rail",...]
  const filter = modes.length
    ? ["any", ...modes.map(m => ["in", m, ["get", "modes"]])]
    : ["==", ["get", "id"], "__none__"];

  map.setFilter("facilities-layer", filter);
}

// 6) Load metrics (headline numbers)
async function loadMetrics() {
  try {
    const res = await fetch("data/metrics.json");
    const m = await res.json();
    const pct = m?.overall?.true_intermodal_pct;
    document.getElementById("headline-value").textContent =
      (pct !== undefined && pct !== null) ? `${pct}%` : "—";
  } catch (e) {
    document.getElementById("headline-value").textContent = "—";
  }
}

// 7) On map load: add data + layer
map.on("load", async () => {
  await loadMetrics();

  const res = await fetch("data/facilities.geojson");
  const data = await res.json();

  map.addSource("facilities", {
    type: "geojson",
    data
  });

  // Facilities as circles
  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      // size
