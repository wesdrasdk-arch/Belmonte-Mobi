// Gera o HTML do mapa Leaflet (OpenStreetMap) — sem chave de API.
export type MapMarker = { lat: number; lng: number; label?: string; color?: string };

export function buildMapHtml(markers: MapMarker[], route?: [number, number][]): string {
  const valid = markers.filter((m) => typeof m.lat === "number" && typeof m.lng === "number");
  const pts = JSON.stringify(valid.map((m) => [m.lat, m.lng]));
  const colors = JSON.stringify(valid.map((m) => m.color || "#0369A1"));
  const labels = JSON.stringify(valid.map((m) => m.label || ""));
  const routeJson = JSON.stringify(route && route.length > 1 ? route : []);

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body{margin:0;padding:0;height:100%;background:#E2E8F0}#map{height:100%;width:100%}
.leaflet-tooltip{font-family:sans-serif;font-size:12px}</style>
</head><body>
<div id="map"></div>
<script>
var map = L.map('map', { zoomControl: false, attributionControl: false });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
var pts = ${pts};
var colors = ${colors};
var labels = ${labels};
var route = ${routeJson};
if (route.length > 1) { L.polyline(route, { color: '#0284C7', weight: 4, opacity: 0.9 }).addTo(map); }
pts.forEach(function(p, i) {
  L.circleMarker(p, { radius: 9, color: '#FFFFFF', weight: 2.5, fillColor: colors[i], fillOpacity: 1 })
    .addTo(map)
    .bindTooltip(labels[i] || '', { permanent: true, direction: 'top', offset: [0, -8] });
});
if (route.length > 1) { map.fitBounds(L.latLngBounds(route).pad(0.15)); }
else if (pts.length > 1) { map.fitBounds(L.latLngBounds(pts).pad(0.25)); }
else if (pts.length === 1) { map.setView(pts[0], 15); }
else { map.setView([-15.8582, -39.0769], 13); }
</script>
</body></html>`;
}
