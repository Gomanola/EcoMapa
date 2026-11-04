/**
 * DELETE /points/{pointId}
 * Deletes a collection point from DynamoDB.
 */
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error } from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const pointId = event.pathParameters?.pointId;
    if (!pointId) {
      return error('Se requiere el parametro pointId', 400);
    }

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { pointId },
        ConditionExpression: 'attribute_exists(pointId)',
      })
    );

    return success({ message: 'Punto eliminado correctamente', pointId });
  } catch (err) {
    console.error('Error deleting point:', err);
    const errName = (err as { name?: string }).name;
    if (errName === 'ConditionalCheckFailedException') {
      return error('Punto de recoleccion no encontrado', 404);
    }
    return error('Error al eliminar el punto', 500);
  }
};
