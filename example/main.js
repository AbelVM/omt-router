import { MapLibreRoutingControl } from '../dist/omt-router.js';

const TILE_JSON_URL = './planet.json';//'https://tiles.openfreemap.org/planet';
const ENABLE_DEBUG = false;
const DEFAULT_CENTER = [-3.7038093072127265, 40.416644888955474]; // Km.0 Madrid, Spain
const DEFAULT_ZOOM = 14;
const DEFAULT_MIN_ZOOM = 10;

async function getGeoIpCenter() {
  try {
    const response = await fetch('http://ip-api.com/json/');
    const data = await response.json();
    if (response.ok && data && data.status === 'success') {
      const { lat, lon } = data;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return [lon, lat];
      }
    }
  } catch (error) {
    console.warn('GeoIP lookup failed:', error);
  }
  return DEFAULT_CENTER;
}

async function initMap() {
  const center = await getGeoIpCenter();

  const map = new maplibregl.Map({
    container: 'map',
    style: './bright.json',//'https://tiles.openfreemap.org/styles/bright',
    center,
    zoom: DEFAULT_ZOOM,
    minZoom: DEFAULT_MIN_ZOOM,
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
}

initMap();
