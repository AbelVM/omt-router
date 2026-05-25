import { MapLibreRoutingControl } from '../dist/omt-router.js';

const TILE_JSON_URL = 'https://tiles.openfreemap.org/planet';
const ENABLE_DEBUG = false;
const DEFAULT_CENTER = [-3.7038093072127265, 40.416644888955474]; // Km.0 Madrid, Spain
const DEFAULT_ZOOM = 14;
const DEFAULT_MIN_ZOOM = 10;

async function getGeoIpCenter() {
  try {
    const response = await fetch('https://api.country.is/?fields=location');
    const data = await response.json();
    if (response.ok) {
      const location = data.location
      const { latitude, longitude } = location;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return [longitude, latitude];
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
    style: 'https://tiles.openfreemap.org/styles/bright',
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
