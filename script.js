console.log("script loaded ✅");

mapboxgl.accessToken = "pk.eyJ1IjoibGF1cmFiZWFkb2JpZSIsImEiOiJjbWJyaHZlNXYwNmxpMmpwczlmMGMxNGRlIn0.yN5L1Kzhab1IH9TSiyZmqQ";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-98, 39],
  zoom: 3
});

map.addControl(new mapboxgl.NavigationControl(), "bottom-right");

map.on("load", async () => {
  console.log("map loaded ✅");

  const url = "data/facilities.geojson";
  console.log("Fetching:", url);

  const res = await fetch(url);
  console.log("Fetch status:", res.status);

  if (!res.ok) {
    alert(`Could not load ${url} (HTTP ${res.status}).`);
    return;
  }

  const data = await res.json();
  console.log("GeoJSON type:", data?.type);
  console.log("Feature count:", data?.features?.length);

  if (!data?.features?.length) {
    alert("GeoJSON loaded but has 0 features. The file content might be wrong/empty.");
    return;
  }

  map.addSource("facilities", { type: "geojson", data });

  map.addLayer({
    id: "facilities-layer",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-color": "#4da3ff",
      "circle-radius": 2.6,
      "circle-opacity": 0.9,
      "circle-stroke-width": 0.4,
      "circle-stroke-color": "rgba(255,255,255,0.20)"
    }
  });

  // Zoom to the data (so even if points are “somewhere else” we’ll see them)
  const bounds = new mapboxgl.LngLatBounds();
  for (const f of data.features) {
    const c = f?.geometry?.coordinates;
    if (Array.isArray(c) && c.length === 2) bounds.extend(c);
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 60, duration: 900 });
    console.log("fitBounds ✅");
  } else {
    alert("No valid coordinates found in features.");
  }
});
