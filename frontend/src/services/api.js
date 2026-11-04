/**
 * API client for EcoMapa.
 *
 * Resolves the backend API URL from one of three sources (in priority order):
 *   1. /config.json  - deployed by CDK alongside the frontend (production)
 *   2. VITE_API_URL   - Vite env variable (.env file, development)
 *   3. empty string   - use Vite proxy or same-origin
 *
 * Also provides direct OpenStreetMap Overpass API queries so the frontend
 * can show real-time OSM recycling data alongside the backend database.
 */

let _apiUrl = null;

async function resolveApiUrl() {
  if (_apiUrl !== null) return _apiUrl;

  // 1. Try config.json deployed by CDK
  try {
    const res = await fetch('/config.json');
    if (res.ok) {
      const config = await res.json();
      if (config.apiUrl) {
        _apiUrl = config.apiUrl;
        return _apiUrl;
      }
    }
  } catch {
    // config.json not available (development mode)
  }

  // 2. Try Vite env variable
  _apiUrl = import.meta.env.VITE_API_URL || '';
  return _apiUrl;
}

function buildUrl(endpoint) {
  // _apiUrl ends with '/' (e.g. https://...amazonaws.com/prod/)
  return `${_apiUrl}${endpoint.replace(/^\//, '')}`;
}

// ---------------------------------------------------------------------------
// Backend API
// ---------------------------------------------------------------------------

export async function getPoints(filters = {}) {
  const params = new URLSearchParams();
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  if (filters.payment && filters.payment !== 'all') params.set('payment', filters.payment);
  if (filters.verified !== undefined) params.set('verified', String(filters.verified));

  await resolveApiUrl();
  const res = await fetch(buildUrl(`points?${params.toString()}`));
  if (!res.ok) throw new Error(`Error API: ${res.status}`);
  const data = await res.json();
  return data.points || [];
}

export async function getNearbyPoints(lat, lng, radiusKm = 10, type = null) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radiusKm) });
  if (type) params.set('type', type);

  await resolveApiUrl();
  const res = await fetch(buildUrl(`points/nearby?${params.toString()}`));
  if (!res.ok) throw new Error(`Error API: ${res.status}`);
  const data = await res.json();
  return data.points || [];
}

export async function createPoint(point) {
  await resolveApiUrl();
  const res = await fetch(buildUrl('points'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(point),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

export async function updatePoint(pointId, updates) {
  await resolveApiUrl();
  const res = await fetch(buildUrl(`points/${pointId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function deletePoint(pointId) {
  await resolveApiUrl();
  const res = await fetch(buildUrl(`points/${pointId}`), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

export async function importFromOsm(lat, lng, radius = 50000, types = null) {
  const body = { lat, lng, radius };
  if (types) body.types = types;

  await resolveApiUrl();
  const res = await fetch(buildUrl('points/import-osm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// OpenStreetMap Overpass API (direct from frontend for real-time data)
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

// Map OSM recycling:* tags to our waste type IDs
const OSM_TYPE_MAP = {
  'recycling:metal': 'metal', 'recycling:aluminium': 'metal', 'recycling:cans': 'metal',
  'recycling:steel': 'metal',
  'recycling:plastic': 'plastic', 'recycling:plastic_bottles': 'plastic',
  'recycling:plastic_packaging': 'plastic',
  'recycling:glass': 'glass', 'recycling:glass_bottles': 'glass',
  'recycling:paper': 'paper', 'recycling:newspaper': 'paper',
  'recycling:cardboard': 'cardboard', 'recycling:beverage_cartons': 'cardboard',
  'recycling:batteries': 'battery',
  'recycling:electrical_appliances': 'electronic', 'recycling:electronics': 'electronic',
  'recycling:clothes': 'textile', 'recycling:textiles': 'textile',
  'recycling:cooking_oil': 'oil', 'recycling:engine_oil': 'oil', 'recycling:oil': 'oil',
  'recycling:tyres': 'tire', 'recycling:tires': 'tire',
  'recycling:green_waste': 'organic', 'recycling:organic': 'organic',
  'recycling:styrofoam': 'unicel', 'recycling:eps': 'unicel',
};

export async function getOsmPoints(bbox) {
  // bbox: { south, west, north, east }
  const query = `
[out:json][timeout:25];
(
  node["amenity"="recycling"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["amenity"="recycling"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center 300;
`.trim();

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`);
      if (!res.ok) {
        lastError = new Error(`Overpass ${endpoint}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const elements = data.elements || [];
      return elements
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (lat === undefined || lng === undefined) return null;

          const tags = el.tags || {};
          const types = [];
          for (const [osmKey, ourType] of Object.entries(OSM_TYPE_MAP)) {
            if (tags[osmKey] === 'yes' || (osmKey === 'recycling:glass' && tags[osmKey] === 'bottles')) {
              if (!types.includes(ourType)) types.push(ourType);
            }
          }

          // If it's a recycling centre with no specific types, add general types
          if (types.length === 0 && (tags.recycling_type === 'centre' || tags.recycling_type === 'center')) {
            types.push('plastic', 'glass', 'metal', 'paper', 'cardboard');
          }

          if (types.length === 0) return null;

          return {
            pointId: `osm-${el.type}-${el.id}`,
            name: tags.name || tags['name:es'] || tags.brand || 'Centro de reciclaje (OSM)',
            description: tags.operator ? `Operado por: ${tags.operator}` : undefined,
            lat,
            lng,
            address: tags['addr:street']
              ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim()
              : undefined,
            types,
            primaryType: types[0],
            paymentType: 'none',
            phone: tags.phone || tags['contact:phone'],
            hours: tags.opening_hours,
            website: tags.website || tags['contact:website'],
            source: 'osm',
            verified: false,
          };
        })
        .filter(Boolean);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error('Overpass API: todos los endpoints fallaron');
}

// ---------------------------------------------------------------------------
// Route planning via OSRM public API
// ---------------------------------------------------------------------------

export async function getRoute(fromLat, fromLng, toLat, toLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Error al calcular la ruta');
  const data = await res.json();
  if (data.routes && data.routes.length > 0) {
    const route = data.routes[0];
    return {
      geometry: route.geometry, // GeoJSON LineString
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
    };
  }
  return null;
}
