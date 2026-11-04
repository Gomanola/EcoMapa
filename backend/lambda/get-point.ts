/**
 * GET /points/{pointId}
 * Gets a single collection point by ID from DynamoDB.
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error } from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const pointId = event.pathParameters?.pointId;
    if (!pointId) {
      return error('Se requiere el parametro pointId', 400);
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { pointId },
      })
    );

    if (!result.Item) {
      return error('Punto de recoleccion no encontrado', 404);
    }

    return success({ point: result.Item });
  } catch (err) {
    console.error('Error getting point:', err);
    return error('Error al obtener el punto de recoleccion', 500);
  }
};
