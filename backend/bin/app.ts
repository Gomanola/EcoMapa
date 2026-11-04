#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcoMapaStack } from '../lib/ecomapa-stack';

const app = new cdk.App();

new EcoMapaStack(app, 'EcoMapaStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID || '312816040766',
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
  },
  description: 'EcoMapa - Waste Collection Points Map (API + Frontend Hosting)',
});

app.synth();
