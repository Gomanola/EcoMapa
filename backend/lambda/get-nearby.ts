/**
 * GET /points/nearby?lat=X&lng=Y&radius=Z
 * Finds collection points within a given radius (in km) of a location.
 * Uses a Scan with bounding-box filter, then refines with Haversine distance.
 */
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error, haversineKm } from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const qs = event.queryStringParameters || {};
    const lat = Number(qs.lat);
    const lng = Number(qs.lng);
    const radiusKm = Number(qs.radius) || 10; // default 10 km
    const typeFilter = qs.type;

    if (isNaN(lat) || isNaN(lng)) {
      return error('Parametros "lat" y "lng" son obligatorios y deben ser numericos', 400);
    }

    // Bounding box for pre-filtering (1 degree ~= 111 km)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression:
          'lat BETWEEN :latMin AND :latMax AND lng BETWEEN :lngMin AND :lngMax',
        ExpressionAttributeValues: {
          ':latMin': lat - latDelta,
          ':latMax': lat + latDelta,
          ':lngMin': lng - lngDelta,
          ':lngMax': lng + lngDelta,
        },
      })
    );

    // Refine with precise Haversine distance and apply type filter
    let items = (result.Items || []).map((item) => {
      const distance = haversineKm(lat, lng, item.lat as number, item.lng as number);
      return { ...item, distance: Math.round(distance * 100) / 100 };
    });

    // Filter by actual radius
    items = items.filter((item) => item.distance <= radiusKm);

    // Filter by type if specified
    if (typeFilter) {
      items = items.filter(
        (item) =>
          Array.isArray(item.types) && item.types.includes(typeFilter)
      );
    }

    // Sort by distance (closest first)
    items.sort((a, b) => (a.distance as number) - (b.distance as number));

    return success({ count: items.length, radiusKm, points: items });
  } catch (err) {
    console.error('Error finding nearby points:', err);
    return error('Error al buscar puntos cercanos', 500);
  }
};
