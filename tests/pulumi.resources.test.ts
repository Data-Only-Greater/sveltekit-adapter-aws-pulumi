import * as fs from 'fs';
import * as path from 'path';

import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

import { MyMocks, promiseOf, findResource, getTempDir } from './utils';

describe('pulumi/resources.ts', () => {
  let infra: typeof import('../pulumi/resources');
  let mocks: MyMocks;
  
  beforeEach(async () => {
    vi.resetModules();
    mocks = new MyMocks();
    pulumi.runtime.setMocks(mocks);
    infra = await import('../pulumi/resources');
  });

  it('getLambdaRole', async () => {
    const test = infra.getLambdaRole();
    const assumeRolePolicy = await promiseOf(test.assumeRolePolicy);
    const statement = JSON.parse(assumeRolePolicy).Statement[0];
    
    console.log(statement)
    expectTypeOf(test).toEqualTypeOf<aws.iam.Role>();
    expect(statement.Action).toMatch('sts:AssumeRole');
    expect(statement.Effect).toMatch('Allow');
    expect(statement.Principal.Service).toMatch('lambda.amazonaws.com');
    
  });

  it('buildServer', async () => {
    const memorySize = 128;
    const serverPath = 'mock';

    const iamForLambda = infra.getLambdaRole();
    const { httpApi, defaultRoute } = infra.buildServer(iamForLambda, serverPath, memorySize, {});

    const protocolType = await promiseOf(httpApi.protocolType);
    const expectedApiId = await promiseOf(httpApi.id);
    const executionArn = await promiseOf(httpApi.executionArn);

    expectTypeOf(httpApi).toEqualTypeOf<aws.apigatewayv2.Api>();
    expect(protocolType).toMatch('HTTP');

    const routeKey = await promiseOf(defaultRoute.routeKey);
    const routeApiId = await promiseOf(defaultRoute.apiId);
    
    await new Promise((r) => setTimeout(r, 1000));
    
    console.log(routeApiId)
    expectTypeOf(defaultRoute).toEqualTypeOf<aws.apigatewayv2.Route>();
    expect(routeKey).toMatch('$default');
    expect(routeApiId).toMatch(expectedApiId);

    const target = await promiseOf(defaultRoute.target);
    const integrationMatch = target!.match('integrations/(.*?)-id');
    const serverIntegrationName = integrationMatch![1];
    
    console.log(mocks.resources)
    
    expect(mocks.resources).toHaveProperty(serverIntegrationName);
    const serverIntegration = mocks.resources[serverIntegrationName];

    expect(serverIntegration.type).toMatch('aws:apigatewayv2/integration:Integration');
    expect(serverIntegration.apiId).toMatch(expectedApiId);
    expect(serverIntegration.integrationMethod).toMatch('POST');
    expect(serverIntegration.integrationType).toMatch('AWS_PROXY');
    expect(serverIntegration.payloadFormatVersion).toMatch('1.0');

    const lambdaMatch = serverIntegration.integrationUri.match('(.*?)-arn');
    const lambdaIntegrationName = lambdaMatch![1];

    expect(mocks.resources).toHaveProperty(lambdaIntegrationName);
    const lambda = mocks.resources[lambdaIntegrationName];
    const iamArn = await promiseOf(iamForLambda.arn);
    const codePath = await lambda.code.path;

    expect(lambda.type).toMatch('aws:lambda/function:Function');
    expect(lambda.handler).toMatch('index.handler');
    expect(lambda.memorySize).toEqual(memorySize);
    expect(lambda.runtime).toMatch('nodejs16.x');
    expect(lambda.timeout).toEqual(900);
    expect(lambda.role).toMatch(iamArn);
    expect(codePath).toMatch(serverPath);

    // Can't access role in mock outputs for RolePolicyAttachment
    const RPA = findResource(mocks, 'aws:iam/rolePolicyAttachment:RolePolicyAttachment');
    expect(RPA).toBeDefined();
    expect(RPA!.policyArn).toMatch('arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole');

    const serverPermission = findResource(mocks, 'aws:lambda/permission:Permission');
    expect(serverPermission).toBeDefined();
    expect(serverPermission!.action).toMatch('lambda:InvokeFunction');
    expect(serverPermission!.principal).toMatch('apigateway.amazonaws.com');

    const sourceArnMatch = serverPermission!.sourceArn.match('(.*?)/\\*/\\*');
    const sourceArn = sourceArnMatch![1];
    expect(sourceArn).toMatch(executionArn);

    const functionId = await promiseOf(serverPermission!.function.id);
    expect(functionId).toMatch(lambda.id);
  });

  it('validateCertificate-Wrong-Domain', async () => {
    const FQDN = 'server.example.com';
    const domainName = 'another.com';
    expect(() => infra.validateCertificate(FQDN, domainName)).toThrowError('FQDN must contain domainName');
  });

  // Not sure how to capture the provider for the certificate or the pre-existing hosted zone
  it('validateCertificate', async () => {
    const FQDN = 'server.example.com';
    const domainName = 'example.com';

    const certificateArn = await promiseOf(infra.validateCertificate(FQDN, domainName));
    const certificateValidation = findResource(mocks, 'aws:acm/certificateValidation:CertificateValidation');

    expect(certificateValidation!.certificateArn).toMatch(certificateArn);
    expect(certificateValidation!.validationRecordFqdns[0]).toMatch('server.example.com');

    const validationRecord = findResource(mocks, 'aws:route53/record:Record');
    const certificateMatch = validationRecord!.name.match('(.*?)-resourceRecordName');
    const certificateName = certificateMatch![1];

    expect(mocks.resources).toHaveProperty(certificateName);
    const certificate = mocks.resources[certificateName];

    // The type input to aws:route53/record:Record isn't handled
    expect(certificate.type).toMatch('aws:acm/certificate:Certificate');
    expect(certificate.domainName).toMatch(domainName);
    expect(certificate.validationMethod).toMatch('DNS');

    expect(validationRecord!.name).toMatch(certificate.domainValidationOptions[0].resourceRecordName);
    expect(validationRecord!.records[0]).toMatch(certificate.domainValidationOptions[0].resourceRecordValue);
    expect(validationRecord!.ttl).toEqual(60);
    expect(validationRecord!.zoneId).toMatch(`${FQDN}.validation-zone`);
  });

  it('uploadStatic', async () => {
    const tmpDir = getTempDir();
    const childDir = path.join(tmpDir, 'child');

    fs.mkdirSync(childDir);
    fs.closeSync(fs.openSync(path.join(tmpDir, 'a.mock'), 'w'));
    fs.closeSync(fs.openSync(path.join(childDir, 'b.mock'), 'w'));

    const bucket = new aws.s3.Bucket('MockBucket');
    const bucketId = await promiseOf(bucket.id);
    infra.uploadStatic(tmpDir, bucket);

    fs.rmSync(tmpDir, { recursive: true });

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100));
    var fileArray = ['a.mock', path.join('child', 'b.mock')];

    for (const fileName of fileArray) {
      const posixFilePath = fileName.split(path.sep).join(path.posix.sep);
      expect(mocks.resources).toHaveProperty(posixFilePath);

      const item = mocks.resources[posixFilePath];
      expect(item.type).toMatch('aws:s3/bucketObject:BucketObject');
      expect(item.key).toMatch(posixFilePath);
      expect(item.bucket).toMatch(bucketId);

      const sourcePath = await item.source.path;
      expect(sourcePath).toContain(fileName);
    }
  });

  it('buildStatic', async () => {
    const spy = vi.spyOn(infra, 'uploadStatic').mockImplementation(() => null);
    infra.buildStatic('mock', 'mock');
    expect(spy).toHaveBeenCalledTimes(2);

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100));

    expect(Object.keys(mocks.resources)).toHaveLength(1);
    const resource = Object.values(mocks.resources)[0];

    expect(resource.type).toMatch('aws:s3/bucket:Bucket');
    expect(resource.acl).toMatch('private');
    expect(resource.forceDestroy).toBe(true);
  });

  it('buildCDN', async () => {
    const httpApi = new aws.apigatewayv2.Api('MockAPI', {
      protocolType: 'HTTP',
    });
    const bucket = new aws.s3.Bucket('MockBucket');
    const routes = ['mock/*', 'another/*'];
    const serverHeaders = ['mock1', 'mock2'];
    const staticHeaders = ['mock3'];
    const FQDN = 'server.example.com';
    const certificateArn = 'MockCertificateArn';
    const bucketId = await promiseOf(bucket.id);
    const bucketArn = await promiseOf(bucket.arn);

    const distribution = infra.buildCDN(httpApi, bucket, routes, serverHeaders, staticHeaders, FQDN, certificateArn);

    const distOrigins = await promiseOf(distribution.origins);
    expect(distOrigins).toHaveLength(2);

    let customOriginIndex: number | undefined;

    for (const [i, value] of distOrigins.entries()) {
      if (value.hasOwnProperty('customOriginConfig')) {
        customOriginIndex = i;
        break;
      }
    }

    expect(customOriginIndex).toBeDefined();
    const customOrigin = distOrigins[customOriginIndex!];

    expect(customOrigin.domainName).toMatch('example.com');
    expect(customOrigin.customOriginConfig!.httpPort).toBe(80);
    expect(customOrigin.customOriginConfig!.httpsPort).toBe(443);
    expect(customOrigin.customOriginConfig!.originProtocolPolicy).toMatch('https-only');
    expect(customOrigin.customOriginConfig!.originSslProtocols).toEqual(['SSLv3', 'TLSv1', 'TLSv1.1', 'TLSv1.2']);

    let s3OriginIndex: number | undefined;

    for (const [i, value] of distOrigins.entries()) {
      if (value.hasOwnProperty('originAccessControlId')) {
        s3OriginIndex = i;
        break;
      }
    }

    expect(s3OriginIndex).toBeDefined();
    const s3Origin = distOrigins[s3OriginIndex!];

    expect(s3Origin.domainName).toMatch('bucket.s3.mock-west-1.amazonaws.com');

    const oacMatch = s3Origin.originAccessControlId!.match('(.*?)-id');
    const oacName = oacMatch![1];
    const oac = mocks.resources[oacName];

    expect(oac.type).toMatch('aws:cloudfront/originAccessControl:OriginAccessControl');
    expect(oac.originAccessControlOriginType).toMatch('s3');
    expect(oac.signingBehavior).toMatch('always');
    expect(oac.signingProtocol).toMatch('sigv4');

    const distAliases = await promiseOf(distribution.aliases);
    const distEnabled = await promiseOf(distribution.enabled);
    const distViewerCertificate = await promiseOf(distribution.viewerCertificate);
    const distDefaultCacheBehavior = await promiseOf(distribution.defaultCacheBehavior);
    const distOrderedCacheBehaviors = await promiseOf(distribution.orderedCacheBehaviors);
    const distArn = await promiseOf(distribution.arn);

    expect(distAliases).toContain(FQDN);
    expect(distEnabled).toBe(true);
    expect(distViewerCertificate.acmCertificateArn).toMatch(certificateArn);
    expect(distViewerCertificate.sslSupportMethod).toMatch('sni-only');
    expect(distDefaultCacheBehavior.allowedMethods).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ]);
    expect(distDefaultCacheBehavior.cachedMethods).toEqual(['GET', 'HEAD']);
    expect(distDefaultCacheBehavior.compress).toBe(true);
    expect(distDefaultCacheBehavior.viewerProtocolPolicy).toMatch('redirect-to-https');
    expect(distDefaultCacheBehavior.targetOriginId).toMatch(customOrigin.originId);
    expect(distDefaultCacheBehavior.cachePolicyId).toMatch('aws:cloudfront/getCachePolicy:getCachePolicy-id');

    const originRequestPolicyMatch = distDefaultCacheBehavior.originRequestPolicyId!.match('(.*?)-id');
    const originRequestPolicyName = originRequestPolicyMatch![1];
    const originRequestPolicy = mocks.resources[originRequestPolicyName];

    expect(originRequestPolicy.type).toMatch('aws:cloudfront/originRequestPolicy:OriginRequestPolicy');
    expect(originRequestPolicy.cookiesConfig.cookieBehavior).toMatch('all');
    expect(originRequestPolicy.headersConfig.headerBehavior).toMatch('whitelist');
    expect(originRequestPolicy.headersConfig.headers.items).toEqual(serverHeaders);
    expect(originRequestPolicy.queryStringsConfig.queryStringBehavior).toMatch('all');

    expect(distOrderedCacheBehaviors).toHaveLength(2);

    let pathPatterns: string[] = [];
    distOrderedCacheBehaviors!.forEach(function (item, index) {
      pathPatterns.push(item.pathPattern);
      expect(item.allowedMethods).toEqual(['GET', 'HEAD', 'OPTIONS']);
      expect(item.cachePolicyId).toMatch('aws:cloudfront/getCachePolicy:getCachePolicy-id');
      expect(item.cachedMethods).toEqual(['GET', 'HEAD', 'OPTIONS']);
      expect(item.targetOriginId).toMatch('s3Origin');
      expect(item.viewerProtocolPolicy).toMatch('redirect-to-https');
    });

    expect(pathPatterns).toEqual(routes);

    const routeRequestPolicyMatch = distOrderedCacheBehaviors![0].originRequestPolicyId!.match('(.*?)-id');
    const routeRequestPolicyName = routeRequestPolicyMatch![1];
    const routeRequestPolicy = mocks.resources[routeRequestPolicyName];

    expect(routeRequestPolicy.type).toMatch('aws:cloudfront/originRequestPolicy:OriginRequestPolicy');
    expect(routeRequestPolicy.cookiesConfig.cookieBehavior).toMatch('none');
    expect(routeRequestPolicy.headersConfig.headerBehavior).toMatch('whitelist');
    expect(routeRequestPolicy.headersConfig.headers.items).toEqual(staticHeaders);
    expect(routeRequestPolicy.queryStringsConfig.queryStringBehavior).toMatch('none');

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100));
    const bucketPolicy = findResource(mocks, 'aws:s3/bucketPolicy:BucketPolicy');
    const bucketPolicyWording = JSON.parse(bucketPolicy!.policy);

    expect(bucketPolicy!.bucket).toMatch(bucketId);
    expect(bucketPolicyWording.statements).toHaveLength(2);

    const getObjectStatement = bucketPolicyWording.statements[0];

    expect(getObjectStatement.actions).toEqual(['s3:GetObject']);
    expect(getObjectStatement.principals).toHaveLength(1);
    expect(getObjectStatement.principals[0].type).toMatch('Service');
    expect(getObjectStatement.principals[0].identifiers).toEqual(['cloudfront.amazonaws.com']);
    expect(getObjectStatement.resources).toEqual([`${bucketArn}/*`]);
    expect(getObjectStatement.conditions).toHaveLength(1);
    expect(getObjectStatement.conditions[0].test).toMatch('StringEquals');
    expect(getObjectStatement.conditions[0].variable).toMatch('AWS:SourceArn');
    expect(getObjectStatement.conditions[0].values).toEqual([distArn]);

    const httpsStatement = bucketPolicyWording.statements[1];

    expect(httpsStatement.actions).toEqual(['s3:*']);
    expect(httpsStatement.effect).toMatch('Deny');
    expect(httpsStatement.principals).toHaveLength(1);
    expect(httpsStatement.principals[0].type).toMatch('AWS');
    expect(httpsStatement.principals[0].identifiers).toEqual(['*']);
    expect(httpsStatement.resources).toEqual([`${bucketArn}/*`, bucketArn]);
    expect(httpsStatement.conditions).toHaveLength(1);
    expect(httpsStatement.conditions[0].test).toMatch('Bool');
    expect(httpsStatement.conditions[0].variable).toMatch('aws:SecureTransport');
    expect(httpsStatement.conditions[0].values).toEqual(['false']);
  });

  it('buildCDN (No FQDN)', async () => {
    const httpApi = new aws.apigatewayv2.Api('MockAPI', {
      protocolType: 'HTTP',
    });
    const bucket = new aws.s3.Bucket('MockBucket');
    const routes = ['mock/*', 'another/*'];
    const serverHeaders = ['mock1', 'mock2'];
    const staticHeaders = ['mock3'];

    const distribution = infra.buildCDN(httpApi, bucket, routes, serverHeaders, staticHeaders, undefined, undefined);

    const distAliases = await promiseOf(distribution.aliases);
    const distViewerCertificate = await promiseOf(distribution.viewerCertificate);

    expect(distAliases).toBeUndefined();
    expect(distViewerCertificate.cloudfrontDefaultCertificate).toBe(true);
  });

  it('createAliasRecord', async () => {
    const hostedZoneId = 'mockZone-Id';
    const domainName = 'bob.com';
    const targetDomain = 'mock.example.com';
    const domainParts = targetDomain.split('.');
    const distribution: Partial<aws.cloudfront.Distribution> = {
      domainName: pulumi.Output.create(domainName),
      hostedZoneId: pulumi.Output.create(hostedZoneId),
    };

    const record = infra.createAliasRecord(targetDomain, <aws.cloudfront.Distribution>distribution);
    const recordName = await promiseOf(record.name);
    const recordZoneId = await promiseOf(record.zoneId);
    const recordType = await promiseOf(record.type);
    const recordAliases = await promiseOf(record.aliases);

    expect(recordName).toMatch(domainParts[0]);
    expect(recordZoneId).toMatch(`${targetDomain}-zone`);
    expect(recordType).toMatch('A');

    expect(recordAliases).toHaveLength(1);
    expect(recordAliases![0].evaluateTargetHealth).toBe(true);
    expect(recordAliases![0].name).toMatch(domainName), expect(recordAliases![0].zoneId).toMatch(hostedZoneId);
  });

  it.each([
    ['www.example.com', 'www', 'example.com'],
    ['www.example.co.uk', 'www', 'example.co.uk'],
    ['example.com', '', 'example.com'],
  ])('getDomainAndSubdomain[%s]', async (domain, sub, parent) => {
    const { subdomain, parentDomain } = infra.getDomainAndSubdomain(domain);
    expect(subdomain).toMatch(sub);
    expect(parentDomain).toMatch(parent);
  });

  it('buildServerOptionsHandler', async () => {
    const iamForLambda = infra.getLambdaRole();
    const httpApi = new aws.apigatewayv2.Api('MockAPI', {
      protocolType: 'HTTP',
    });
    const allowedOrigins = ['https://mock.example.com', 'https://mock.another.com'];

    const optionsRoute = infra.buildServerOptionsHandler(iamForLambda, httpApi, allowedOrigins);

    const routeKey = await promiseOf(optionsRoute.routeKey);
    const routeApiId = await promiseOf(optionsRoute.apiId);
    const expectedApiId = await promiseOf(httpApi.id);
    const executionArn = await promiseOf(httpApi.executionArn);

    expectTypeOf(optionsRoute).toEqualTypeOf<aws.apigatewayv2.Route>();
    expect(routeKey).toMatch('OPTIONS /{proxy+}');
    expect(routeApiId).toMatch(expectedApiId);

    const target = await promiseOf(optionsRoute.target);
    const integrationMatch = target!.match('integrations/(.*?)-id');
    const serverIntegrationName = integrationMatch![1];

    expect(mocks.resources).toHaveProperty(serverIntegrationName);
    const serverIntegration = mocks.resources[serverIntegrationName];

    expect(serverIntegration.type).toMatch('aws:apigatewayv2/integration:Integration');
    expect(serverIntegration.apiId).toMatch(expectedApiId);
    expect(serverIntegration.integrationMethod).toMatch('POST');
    expect(serverIntegration.integrationType).toMatch('AWS_PROXY');
    expect(serverIntegration.payloadFormatVersion).toMatch('1.0');

    const lambdaMatch = serverIntegration.integrationUri.match('(.*?)-arn');
    const lambdaIntegrationName = lambdaMatch![1];

    expect(mocks.resources).toHaveProperty(lambdaIntegrationName);
    const lambda = mocks.resources[lambdaIntegrationName];

    const iamArn = await promiseOf(iamForLambda.arn);
    const codeAssets = await lambda.code.assets;

    expect(lambda.type).toMatch('aws:lambda/function:Function');
    expect(lambda.handler).toMatch('index.handler');
    expect(lambda.runtime).toMatch('nodejs16.x');
    expect(lambda.role).toMatch(iamArn);
    expect(codeAssets).toHaveProperty('index.js');

    const codeText = await codeAssets['index.js'].text;
    expect(codeText).toMatch(/exports.handler/);

    // Can't access role in mock outputs for RolePolicyAttachment
    const RPA = findResource(mocks, 'aws:iam/rolePolicyAttachment:RolePolicyAttachment');
    expect(RPA).toBeDefined();
    expect(RPA!.policyArn).toMatch('arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole');

    const serverPermission = findResource(mocks, 'aws:lambda/permission:Permission');
    expect(serverPermission).toBeDefined();
    expect(serverPermission!.action).toMatch('lambda:InvokeFunction');
    expect(serverPermission!.principal).toMatch('apigateway.amazonaws.com');

    const sourceArnMatch = serverPermission!.sourceArn.match('(.*?)/\\*/\\*');
    const sourceArn = sourceArnMatch![1];
    expect(sourceArn).toMatch(executionArn);

    const functionId = await promiseOf(serverPermission!.function.id);
    expect(functionId).toMatch(lambda.id);
  });

  it('deployServer', async () => {
    const httpApi = new aws.apigatewayv2.Api('MockAPI', {
      protocolType: 'HTTP',
    });
    const expectedApiId = await promiseOf(httpApi.id);

    infra.deployServer(httpApi, []);

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100));

    const stage = findResource(mocks, 'aws:apigatewayv2/stage:Stage');
    expect(stage).toBeDefined();

    expect(stage!.name).toMatch('$default');
    expect(stage!.autoDeploy).toBe(true);
    expect(stage!.apiId).toMatch(expectedApiId);
  });
});
