/**
 * POST /points
 * Creates a new collection point in DynamoDB.
 *
 * Required body fields: name, lat, lng, types
 * Optional fields: description, address, paymentType, paymentAmount, paymentUnit,
 *                 phone, hours, website, source, submittedBy
 *
 * User-submitted points default to source='user' and verified=false.
 */
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  docClient,
  tableName,
  success,
  error,
  validatePointInput,
  generateId,
  type CollectionPoint,
} from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const validation = validatePointInput(event.body);
    if (!validation.valid || !validation.data) {
      return error(validation.error || 'Entrada invalida', 400);
    }

    const now = new Date().toISOString();
    const data = validation.data;

    const point: CollectionPoint = {
      pointId: data.pointId || generateId(),
      name: data.name,
      description: data.description,
      lat: data.lat,
      lng: data.lng,
      address: data.address,
      types: data.types,
      primaryType: data.types[0], // first type for GSI indexing
      paymentType: data.paymentType,
      paymentAmount: data.paymentAmount,
      paymentUnit: data.paymentUnit,
      phone: data.phone,
      hours: data.hours,
      website: data.website,
      source: data.source,
      verified: data.verified ?? false, // user submissions are unverified by default
      submittedBy: data.submittedBy,
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: point,
        ConditionExpression: 'attribute_not_exists(pointId)',
      })
    );

    return success({ point }, 201);
  } catch (err) {
    console.error('Error creating point:', err);
    return error('Error al crear el punto de recoleccion', 500);
  }
};
