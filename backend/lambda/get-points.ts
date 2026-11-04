/**
 * GET /points
 * Lists all collection points from DynamoDB.
 * Supports optional query params:
 *   ?type=metal        - filter by waste type
 *   ?source=osm         - filter by data source
 *   ?payment=pay        - filter by payment type
 *   ?verified=true      - filter by verified status
 */
import { ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { docClient, tableName, success, error } from './shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const typeFilter = event.queryStringParameters?.type;
    const sourceFilter = event.queryStringParameters?.source;
    const paymentFilter = event.queryStringParameters?.payment;
    const verifiedFilter = event.queryStringParameters?.verified;

    // If filtering by type, use the GSI for efficiency
    if (typeFilter) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'type-index',
          KeyConditionExpression: '#pt = :type',
          ExpressionAttributeNames: { '#pt': 'primaryType' },
          ExpressionAttributeValues: { ':type': typeFilter },
        })
      );

      let items = result.Items || [];

      // Apply additional filters in-memory
      if (sourceFilter) {
        items = items.filter((item) => item.source === sourceFilter);
      }
      if (paymentFilter) {
        items = items.filter((item) => item.paymentType === paymentFilter);
      }
      if (verifiedFilter !== undefined) {
        const wantVerified = verifiedFilter === 'true';
        items = items.filter((item) => item.verified === wantVerified);
      }

      return success({ count: items.length, points: items });
    }

    // If filtering by source, use the source GSI
    if (sourceFilter) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'source-index',
          KeyConditionExpression: '#src = :source',
          ExpressionAttributeNames: { '#src': 'source' },
          ExpressionAttributeValues: { ':source': sourceFilter },
        })
      );

      let items = result.Items || [];

      if (paymentFilter) {
        items = items.filter((item) => item.paymentType === paymentFilter);
      }
      if (verifiedFilter !== undefined) {
        const wantVerified = verifiedFilter === 'true';
        items = items.filter((item) => item.verified === wantVerified);
      }

      return success({ count: items.length, points: items });
    }

    // No GSI-applicable filter: scan the whole table
    const filterExpressions: string[] = [];
    const exprAttrNames: Record<string, string> = {};
    const exprAttrValues: Record<string, unknown> = {};

    if (paymentFilter) {
      filterExpressions.push('#pay = :payment');
      exprAttrNames['#pay'] = 'paymentType';
      exprAttrValues[':payment'] = paymentFilter;
    }
    if (verifiedFilter !== undefined) {
      filterExpressions.push('#ver = :verified');
      exprAttrNames['#ver'] = 'verified';
      exprAttrValues[':verified'] = verifiedFilter === 'true';
    }

    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
        ExpressionAttributeNames: Object.keys(exprAttrNames).length > 0 ? exprAttrNames : undefined,
        ExpressionAttributeValues: Object.keys(exprAttrValues).length > 0 ? exprAttrValues : undefined,
      })
    );

    return success({ count: result.Items?.length || 0, points: result.Items || [] });
  } catch (err) {
    console.error('Error listing points:', err);
    return error('Error al listar puntos de recoleccion', 500);
  }
};
