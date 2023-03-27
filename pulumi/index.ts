import * as pulumi from '@pulumi/pulumi';

import {
  getLambdaRole,
  buildServer,
  validateCertificate,
  buildStatic,
  buildCDN,
  createAliasRecord,
  buildServerOptionsHandler,
  deployServer,
  buildInvalidator,
} from './resources';
import { getEnvironment } from './utils';

const serverPath = process.env.SERVER_PATH!;
const projectPath = process.env.PROJECT_PATH!;
const staticPath = process.env.STATIC_PATH!;
const prerenderedPath = process.env.PRERENDERED_PATH!;
const memorySize = parseInt(process.env.MEMORY_SIZE!) || 128;
const [_, zoneName, ...MLDs] = process.env.FQDN?.split('.') || [];
const domainName = [zoneName, ...MLDs].join('.');
const routes = process.env.ROUTES?.split(',') || [];
const serverHeaders = process.env.SERVER_HEADERS?.split(',') || [];
const staticHeaders = process.env.STATIC_HEADERS?.split(',') || [];

const iamForLambda = getLambdaRole();
const environment = getEnvironment(projectPath);
const { httpApi, defaultRoute } = buildServer(iamForLambda, serverPath, memorySize, environment);

let certificateArn: pulumi.Input<string> | undefined;

if (process.env.FQDN) {
  certificateArn = validateCertificate(process.env.FQDN, domainName);
}

const bucket = buildStatic(staticPath, prerenderedPath);
const distribution = buildCDN(httpApi, bucket, routes, serverHeaders, staticHeaders, process.env.FQDN, certificateArn);

if (process.env.FQDN) {
  createAliasRecord(process.env.FQDN, distribution);
}

var allowedOrigins: (string | pulumi.Output<string>)[] = [pulumi.interpolate`https://${distribution.domainName}`];
process.env.FQDN && allowedOrigins.push(`https://${process.env.FQDN}`);

const optionsRoute = buildServerOptionsHandler(iamForLambda, httpApi, allowedOrigins);
deployServer(httpApi, [defaultRoute, optionsRoute]);
buildInvalidator(distribution, staticPath, prerenderedPath);

export const appUrl = process.env.FQDN
  ? `https://${process.env.FQDN}`
  : pulumi.interpolate`https://${distribution.domainName}`;
