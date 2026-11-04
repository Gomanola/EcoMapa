/**
 * PUT /points/{pointId}
 * Updates an existing collection point in DynamoDB.
 * Only provided fields are updated; omitted fields remain unchanged.
 */
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error, WASTE_TYPES } from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const pointId = event.pathParameters?.pointId;
    if (!pointId) {
      return error('Se requiere el parametro pointId', 400);
    }

    if (!event.body) {
      return error('Se requiere el cuerpo de la peticion', 400);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(event.body);
    } catch {
      return error('JSON invalido', 400);
    }

    // Build update expression dynamically from provided fields
    const updateExpressions: string[] = [];
    const exprAttrNames: Record<string, string> = {};
    const exprAttrValues: Record<string, unknown> = {};
    let attrIdx = 0;

    const settableFields = [
      'name',
      'description',
      'lat',
      'lng',
      'address',
      'paymentType',
      'paymentAmount',
      'paymentUnit',
      'phone',
      'hours',
      'website',
      'source',
      'verified',
      'submittedBy',
    ];

    for (const field of settableFields) {
      if (parsed[field] !== undefined) {
        attrIdx++;
        const nameKey = `#f${attrIdx}`;
        const valueKey = `:v${attrIdx}`;
        updateExpressions.push(`${nameKey} = ${valueKey}`);
        exprAttrNames[nameKey] = field;
        exprAttrValues[valueKey] = parsed[field];
      }
    }

    // Handle types array - also update primaryType
    if (parsed.types !== undefined && Array.isArray(parsed.types)) {
      const validTypes = (parsed.types as string[]).filter((t) =>
        WASTE_TYPES.includes(t as never)
      );
      if (validTypes.length > 0) {
        attrIdx++;
        updateExpressions.push(`#f${attrIdx} = :v${attrIdx}`);
        exprAttrNames[`#f${attrIdx}`] = 'types';
        exprAttrValues[`:v${attrIdx}`] = validTypes;

        attrIdx++;
        updateExpressions.push(`#f${attrIdx} = :v${attrIdx}`);
        exprAttrNames[`#f${attrIdx}`] = 'primaryType';
        exprAttrValues[`:v${attrIdx}`] = validTypes[0];
      }
    }

    if (updateExpressions.length === 0) {
      return error('No se proporcionaron campos para actualizar', 400);
    }

    // Always update updatedAt
    attrIdx++;
    updateExpressions.push(`#f${attrIdx} = :v${attrIdx}`);
    exprAttrNames[`#f${attrIdx}`] = 'updatedAt';
    exprAttrValues[`:v${attrIdx}`] = new Date().toISOString();

    const result = await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pointId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: exprAttrNames,
        ExpressionAttributeValues: exprAttrValues,
        ConditionExpression: 'attribute_exists(pointId)',
        ReturnValues: 'ALL_NEW',
      })
    );

    return success({ point: result.Attributes });
  } catch (err) {
    console.error('Error updating point:', err);
    // Check if it's a conditional check failure (point doesn't exist)
    const errName = (err as { name?: string }).name;
    if (errName === 'ConditionalCheckFailedException') {
      return error('Punto de recoleccion no encontrado', 404);
    }
    return error('Error al actualizar el punto', 500);
  }
};
