import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'path';

/**
 * EcoMapaStack
 *
 * Provisions a complete serverless web application for locating waste
 * collection points:
 *  - DynamoDB table (partition key: pointId, GSI for type-based queries)
 *  - 7 Lambda functions (Node.js 20.x) bundled with esbuild
 *  - REST API Gateway with Lambda proxy integration + CORS
 *  - S3 bucket for static frontend hosting
 *  - CloudFront distribution serving the frontend
 *
 * Endpoints:
 *   GET    /points               - list all points (filters: ?type=&source=&payment=)
 *   POST   /points               - create a new collection point
 *   GET    /points/nearby         - find points near a location (?lat=&lng=&radius=)
 *   POST   /points/import-osm     - import points from OpenStreetMap Overpass API
 *   GET    /points/{pointId}      - get a single point
 *   PUT    /points/{pointId}      - update a point
 *   DELETE /points/{pointId}      - delete a point
 */
export class EcoMapaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------------------
    // DynamoDB table
    // ---------------------------------------------------------------------------
    const pointsTable = new dynamodb.Table(this, 'CollectionPointsTable', {
      partitionKey: { name: 'pointId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI for filtering by primary waste type
    pointsTable.addGlobalSecondaryIndex({
      indexName: 'type-index',
      partitionKey: { name: 'primaryType', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // GSI for filtering by data source
    pointsTable.addGlobalSecondaryIndex({
      indexName: 'source-index',
      partitionKey: { name: 'source', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // ---------------------------------------------------------------------------
    // Shared bundling config for CRUD Lambda functions
    // ---------------------------------------------------------------------------
    const crudBundlingConfig: lambdaNodejs.NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        POINTS_TABLE_NAME: pointsTable.tableName,
        POWERTOOLS_SERVICE_NAME: 'ecomapa-api',
      },
      bundling: {
        externalModules: ['@aws-sdk/client-dynamodb', '@aws-sdk/lib-dynamodb'],
        minify: true,
        sourceMap: true,
      },
    };

    // Import-OSM function needs more memory and longer timeout for HTTP requests
    const importBundlingConfig: lambdaNodejs.NodejsFunctionProps = {
      ...crudBundlingConfig,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        ...crudBundlingConfig.environment,
        OVERPASS_API_URL: 'https://overpass-api.de/api/interpreter',
      },
    };

    // ---------------------------------------------------------------------------
    // Lambda functions
    // ---------------------------------------------------------------------------
    const getPointsFn = new lambdaNodejs.NodejsFunction(this, 'GetPointsHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'get-points.ts'),
      functionName: 'ecomapa-get-points',
      description: 'List all waste collection points with optional filters',
    });

    const getPointFn = new lambdaNodejs.NodejsFunction(this, 'GetPointHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'get-point.ts'),
      functionName: 'ecomapa-get-point',
      description: 'Get a single collection point by ID',
    });

    const createPointFn = new lambdaNodejs.NodejsFunction(this, 'CreatePointHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'create-point.ts'),
      functionName: 'ecomapa-create-point',
      description: 'Create a new waste collection point',
    });

    const updatePointFn = new lambdaNodejs.NodejsFunction(this, 'UpdatePointHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'update-point.ts'),
      functionName: 'ecomapa-update-point',
      description: 'Update an existing collection point',
    });

    const deletePointFn = new lambdaNodejs.NodejsFunction(this, 'DeletePointHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'delete-point.ts'),
      functionName: 'ecomapa-delete-point',
      description: 'Delete a collection point',
    });

    const getNearbyFn = new lambdaNodejs.NodejsFunction(this, 'GetNearbyHandler', {
      ...crudBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'get-nearby.ts'),
      functionName: 'ecomapa-get-nearby',
      description: 'Find collection points near a location',
    });

    const importOsmFn = new lambdaNodejs.NodejsFunction(this, 'ImportOsmHandler', {
      ...importBundlingConfig,
      entry: path.join(__dirname, '..', 'lambda', 'import-osm.ts'),
      functionName: 'ecomapa-import-osm',
      description: 'Import waste collection points from OpenStreetMap Overpass API',
    });

    // ---------------------------------------------------------------------------
    // IAM - grant granular DynamoDB permissions
    // ---------------------------------------------------------------------------
    pointsTable.grantReadData(getPointsFn);
    pointsTable.grantReadData(getPointFn);
    pointsTable.grantWriteData(createPointFn);
    pointsTable.grantWriteData(updatePointFn);
    pointsTable.grantWriteData(deletePointFn);
    pointsTable.grantReadData(getNearbyFn);
    pointsTable.grantWriteData(importOsmFn);
    pointsTable.grantReadData(importOsmFn);

    // Grant GSI query permissions
    pointsTable.grantReadData(getPointsFn);

    // ---------------------------------------------------------------------------
    // API Gateway - REST API with Lambda proxy integration
    // ---------------------------------------------------------------------------
    const api = new apigateway.RestApi(this, 'EcoMapaApi', {
      restApiName: 'EcoMapaApi',
      description: 'Waste Collection Points Map API',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        allowCredentials: false,
      },
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    // /points resource
    const pointsResource = api.root.addResource('points');

    // GET /points -> list all (with optional filters)
    pointsResource.addMethod('GET', new apigateway.LambdaIntegration(getPointsFn));
    // POST /points -> create new
    pointsResource.addMethod('POST', new apigateway.LambdaIntegration(createPointFn));

    // /points/nearby -> find points near a location (must be before {pointId})
    const nearbyResource = pointsResource.addResource('nearby');
    nearbyResource.addMethod('GET', new apigateway.LambdaIntegration(getNearbyFn));

    // /points/import-osm -> import from OpenStreetMap
    const importResource = pointsResource.addResource('import-osm');
    importResource.addMethod('POST', new apigateway.LambdaIntegration(importOsmFn));

    // /points/{pointId} -> single point operations
    const pointResource = pointsResource.addResource('{pointId}');
    pointResource.addMethod('GET', new apigateway.LambdaIntegration(getPointFn));
    pointResource.addMethod('PUT', new apigateway.LambdaIntegration(updatePointFn));
    pointResource.addMethod('DELETE', new apigateway.LambdaIntegration(deletePointFn));

    // ---------------------------------------------------------------------------
    // S3 bucket for frontend static hosting
    // ---------------------------------------------------------------------------
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `ecomapa-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ---------------------------------------------------------------------------
    // CloudFront distribution
    // ---------------------------------------------------------------------------
    // Origin Access Control for secure S3 access via CloudFront
    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC');

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    // Deploy config.json with API URL so the frontend can auto-configure
    new s3deploy.BucketDeployment(this, 'DeployConfig', {
      destinationBucket: frontendBucket,
      sources: [
        s3deploy.Source.data(
          'config.json',
          JSON.stringify({ apiUrl: api.url }, null, 2)
        ),
      ],
      distribution,
      distributionPaths: ['/config.json'],
    });

    // ---------------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Base URL for the EcoMapa API',
    });

    new cdk.CfnOutput(this, 'PointsEndpoint', {
      value: `${api.url}points`,
      description: 'Full endpoint for the /points resource',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL for the frontend',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket name for frontend deployment',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID (for cache invalidation)',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: pointsTable.tableName,
      description: 'DynamoDB table name',
    });
  }
}
