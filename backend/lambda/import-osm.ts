/**
 * POST /points/import-osm
 * Imports waste collection / recycling points from the OpenStreetMap Overpass API.
 *
 * Request body (optional):
 *   { "lat": 19.4326, "lng": -99.1332, "radius": 10000, "types": ["metal","plastic"] }
 *
 * If lat/lng are omitted, a default bounding box is used.
 * The function queries Overpass for amenity=recycling nodes and ways, maps the
 * OSM recycling:* tags to our waste type categories, and upserts them into
 * DynamoDB.
 */
import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error, generateId, type CollectionPoint } from './shared';

const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

// Map OSM recycling:* tags to our waste type categories
const OSM_TYPE_MAP: Record<string, string> = {
  'recycling:metal': 'metal',
  'recycling:aluminium': 'metal',
  'recycling:steel': 'metal',
  'recycling:cans': 'metal',
  'recycling:plastic': 'plastic',
  'recycling:plastic_bottles': 'plastic',
  'recycling:plastic_packaging': 'plastic',
  'recycling:glass': 'glass',
  'recycling:glass_bottles': 'glass',
  'recycling:paper': 'paper',
  'recycling:cardboard': 'cardboard',
  'recycling:beverage_cartons': 'cardboard',
  'recycling:batteries': 'battery',
  'recycling:electrical_appliances': 'electronic',
  'recycling:electronics': 'electronic',
  'recycling:clothes': 'textile',
  'recycling:textiles': 'textile',
  'recycling:cooking_oil': 'oil',
  'recycling:engine_oil': 'oil',
  'recycling:oil': 'oil',
  'recycling:tyres': 'tire',
  'recycling:tires': 'tire',
  'recycling:green_waste': 'organic',
  'recycling:organic': 'organic',
  'recycling:styrofoam': 'unicel',
  'recycling:eps': 'unicel',
};

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parse request body for location and radius
    let body: { lat?: number; lng?: number; radius?: number; types?: string[] } = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        // ignore parse errors, use defaults
      }
    }

    const lat = body.lat ?? 19.4326; // default: Mexico City
    const lng = body.lng ?? -99.1332;
    const radius = body.radius ?? 50000; // default: 50 km
    const requestedTypes = body.types;

    // Build the Overpass QL query
    // Query for all recycling-related nodes and ways within the radius
    const query = `
[out:json][timeout:60];
(
  node["amenity"="recycling"](around:${radius},${lat},${lng});
  way["amenity"="recycling"](around:${radius},${lat},${lng});
);
out center 200;
`.trim();

    console.log('Querying Overpass API...');
    let data: { elements: OsmElement[] } | null = null;
    let lastError = '';

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        console.log(`Trying Overpass: ${endpoint}`);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'EcoMapa/1.0' },
        });
        if (response.ok) {
          data = (await response.json()) as { elements: OsmElement[] };
          console.log(`Overpass ${endpoint} succeeded`);
          break;
        }
        lastError = `HTTP ${response.status}`;
        console.log(`Overpass ${endpoint} returned ${response.status}`);
      } catch (err) {
        lastError = (err as Error).message;
        console.log(`Overpass ${endpoint} failed:`, err);
      }
    }

    if (!data) {
      return error(`Error de Overpass API: ${lastError}`, 502);
    }

    const elements = data.elements || [];

    console.log(`Overpass returned ${elements.length} elements`);

    // Fetch existing OSM-imported points to avoid duplicates
    const existingResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#src = :source',
        ExpressionAttributeNames: { '#src': 'source' },
        ExpressionAttributeValues: { ':source': 'osm' },
        ProjectionExpression: 'pointId, lat, lng',
      })
    );

    // Build a set of existing coordinates (rounded to 4 decimal places) to detect duplicates
    const existingCoords = new Set(
      (existingResult.Items || []).map((item) => {
        const elat = Number(item.lat).toFixed(4);
        const elng = Number(item.lng).toFixed(4);
        return `${elat},${elng}`;
      })
    );

    let imported = 0;
    let skipped = 0;

    for (const el of elements) {
      // Determine coordinates
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (elLat === undefined || elLng === undefined) continue;

      // Extract waste types from OSM tags
      const tags = el.tags || {};
      const types: string[] = [];

      for (const [osmKey, ourType] of Object.entries(OSM_TYPE_MAP)) {
        if (tags[osmKey] === 'yes' || (osmKey === 'recycling:glass' && tags[osmKey] === 'bottles')) {
          if (!types.includes(ourType)) {
            types.push(ourType);
          }
        }
      }

      // If no specific recycling types found but it's a general recycling point,
      // check the recycling_type tag
      if (types.length === 0) {
        const recyclingType = tags['recycling_type'];
        if (recyclingType === 'centre' || recyclingType === 'center') {
          // It's a recycling centre that accepts general recyclables
          // Add common types based on name or default to 'plastic'
          types.push('plastic', 'glass', 'metal', 'paper', 'cardboard');
        } else if (tags.amenity === 'recycling') {
          // Generic recycling container - skip if no types specified
          skipped++;
          continue;
        }
      }

      if (types.length === 0) {
        skipped++;
        continue;
      }

      // Filter by requested types if specified
      if (requestedTypes && requestedTypes.length > 0) {
        const hasRequestedType = types.some((t) => requestedTypes.includes(t));
        if (!hasRequestedType) {
          skipped++;
          continue;
        }
      }

      // Check for duplicates
      const coordKey = `${elLat.toFixed(4)},${elLng.toFixed(4)}`;
      if (existingCoords.has(coordKey)) {
        skipped++;
        continue;
      }

      // Build the collection point
      const name = tags.name || tags['name:es'] || tags.brand || 'Centro de reciclaje';
      const now = new Date().toISOString();

      const point: CollectionPoint = {
        pointId: generateId(),
        name,
        description: tags.description || tags.operator
          ? `Operado por: ${tags.operator}`
          : undefined,
        lat: elLat,
        lng: elLng,
        address: tags['addr:street']
          ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim()
          : undefined,
        types,
        primaryType: types[0],
        paymentType: 'none', // OSM rarely has payment info
        paymentAmount: undefined,
        paymentUnit: undefined,
        phone: tags.phone || tags['contact:phone'],
        hours: tags.opening_hours,
        website: tags.website || tags['contact:website'],
        source: 'osm',
        verified: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await docClient.send(
          new PutCommand({
            TableName: tableName,
            Item: point,
            ConditionExpression: 'attribute_not_exists(pointId)',
          })
        );
        imported++;
        existingCoords.add(coordKey); // prevent duplicates within same batch
      } catch (putErr) {
        // If conditional check fails (duplicate), skip
        skipped++;
      }
    }

    return success({
      message: 'Importacion desde OpenStreetMap completada',
      totalFound: elements.length,
      imported,
      skipped,
      location: { lat, lng, radiusKm: radius / 1000 },
    });
  } catch (err) {
    console.error('Error importing from OSM:', err);
    return error('Error al importar desde OpenStreetMap', 500);
  }
};
