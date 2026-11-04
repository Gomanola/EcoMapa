/**
 * Shared utilities for all EcoMapa Lambda handlers.
 * Provides the DynamoDB document client, types, validation, and response helpers.
 */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyResult } from 'aws-lambda';

const TABLE_NAME = process.env.POINTS_TABLE_NAME || 'CollectionPointsTable';

// Reuse the client across invocations (Lambda container warm starts)
const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const tableName = TABLE_NAME;

// ---------------------------------------------------------------------------
// Supported waste types
// ---------------------------------------------------------------------------
export const WASTE_TYPES = [
  'metal',
  'plastic',
  'glass',
  'unicel',
  'cardboard',
  'paper',
  'organic',
  'battery',
  'electronic',
  'textile',
  'oil',
  'tire',
  'construction',
] as const;

export type WasteType = (typeof WASTE_TYPES)[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PaymentType = 'charge' | 'pay' | 'free' | 'none';

export interface CollectionPoint {
  pointId: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  address?: string;
  types: string[];
  primaryType: string;
  paymentType: PaymentType;
  paymentAmount?: number;
  paymentUnit?: string;
  phone?: string;
  hours?: string;
  website?: string;
  source: string; // 'osm' | 'user' | 'google' | 'government'
  verified: boolean;
  submittedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreatePointInput = Omit<CollectionPoint, 'pointId' | 'primaryType' | 'verified' | 'createdAt' | 'updatedAt'> & {
  pointId?: string;
  verified?: boolean;
};

export type UpdatePointInput = Partial<Omit<CollectionPoint, 'pointId' | 'createdAt'>>;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export function success(body: unknown, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function error(message: string, statusCode = 400): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
export function validatePointInput(body: string | null): {
  valid: boolean;
  error?: string;
  data?: CreatePointInput;
} {
  if (!body) {
    return { valid: false, error: 'Se requiere el cuerpo de la peticion' };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { valid: false, error: 'JSON invalido en el cuerpo de la peticion' };
  }

  const name = parsed.name as string | undefined;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'El campo "name" es obligatorio' };
  }

  const lat = Number(parsed.lat);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return { valid: false, error: 'El campo "lat" debe ser un numero entre -90 y 90' };
  }

  const lng = Number(parsed.lng);
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return { valid: false, error: 'El campo "lng" debe ser un numero entre -180 y 180' };
  }

  const types = parsed.types as string[] | undefined;
  if (!types || !Array.isArray(types) || types.length === 0) {
    return { valid: false, error: 'El campo "types" es obligatorio (arreglo de tipos de residuo)' };
  }

  const validTypes = types.filter((t) => WASTE_TYPES.includes(t as WasteType));
  if (validTypes.length === 0) {
    return { valid: false, error: `Tipos validos: ${WASTE_TYPES.join(', ')}` };
  }

  const validPaymentTypes = ['charge', 'pay', 'free', 'none'];
  const paymentType = (parsed.paymentType as string) || 'none';
  if (!validPaymentTypes.includes(paymentType)) {
    return { valid: false, error: `paymentType debe ser uno de: ${validPaymentTypes.join(', ')}` };
  }

  return {
    valid: true,
    data: {
      name: name.trim(),
      description: parsed.description ? String(parsed.description) : undefined,
      lat,
      lng,
      address: parsed.address ? String(parsed.address) : undefined,
      types: validTypes,
      paymentType: paymentType as PaymentType,
      paymentAmount: parsed.paymentAmount ? Number(parsed.paymentAmount) : undefined,
      paymentUnit: parsed.paymentUnit ? String(parsed.paymentUnit) : undefined,
      phone: parsed.phone ? String(parsed.phone) : undefined,
      hours: parsed.hours ? String(parsed.hours) : undefined,
      website: parsed.website ? String(parsed.website) : undefined,
      source: (parsed.source as string) || 'user',
      submittedBy: parsed.submittedBy ? String(parsed.submittedBy) : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
export function generateId(): string {
  return `point-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Haversine distance (km) between two coordinates
// ---------------------------------------------------------------------------
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
