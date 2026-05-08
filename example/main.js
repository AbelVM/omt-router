import { MapLibreRoutingControl } from '../dist/omt-router.js';

const TILE_JSON_URL = 'https://tiles.openfreemap.org/planet';
const ENABLE_DEBUG = false;

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/bright',
  center: [-0.4234154902642331, 38.35830745553491],
  zoom: 16,
  minZoom: 10,
});

if (ENABLE_DEBUG) {
  window._map = map;
  map.showTileBoundaries = true;
}

const ctrl = new MapLibreRoutingControl({
  tileJsonUrl: TILE_JSON_URL,
  showGraph: ENABLE_DEBUG,
  routeOptions: {
    maxAutoRadius: 8,
    maxAcceptableSnapDistanceM: 60,
  },
  maplibre: maplibregl,
});
map.addControl(ctrl, 'top-left');

map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
