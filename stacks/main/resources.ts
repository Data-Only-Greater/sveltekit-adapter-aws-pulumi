import * as fs from 'fs'
import * as path from 'path'
import * as mime from 'mime-types'

import * as cloudfront from '@aws-sdk/client-cloudfront'
import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

import { NameRegister } from '../utils.js'

const pulumiConfig = new pulumi.Config('aws')

const nameRegister = NameRegister.getInstance()
let registerName = (name: string): string => {
  return nameRegister.registerName(name)
}

const eastRegion = new aws.Provider(registerName('ProviderEast'), {
  region: 'us-east-1',
})

export function getLambdaRole(functionArns?: string[]): aws.iam.Role {
  interface IAMPolicy {
    statements: [
      {
        principals?: [
          {
            type: string
            identifiers: string[]
          },
        ]
        actions: string[]
        effect: string
        resources?: string[]
      },
    ]
  }

  let lambdaPolicyStub: IAMPolicy = {
    statements: [
      {
        principals: [
          {
            type: 'Service',
            identifiers: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
          },
        ],
        actions: ['sts:AssumeRole'],
        effect: 'Allow',
      },
    ],
  }

  let lambdaPolicyDocument = aws.iam.getPolicyDocumentOutput(lambdaPolicyStub)
  const iamForLambda = new aws.iam.Role(registerName('IamForLambda'), {
    assumeRolePolicy: lambdaPolicyDocument.json,
  })

  new aws.iam.RolePolicyAttachment(
    registerName('ServerRPABasicExecutionRole'),
    {
      role: iamForLambda.name,
      policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    },
  )

  if (functionArns) {
    lambdaPolicyStub = {
      statements: [
        {
          actions: ['lambda:InvokeFunctionUrl'],
          effect: 'Allow',
          resources: functionArns,
        },
      ],
    }

    lambdaPolicyDocument = aws.iam.getPolicyDocumentOutput(lambdaPolicyStub)

    const policy = new aws.iam.Policy(registerName('invokePolicy'), {
      policy: lambdaPolicyDocument.json,
    })

    new aws.iam.RolePolicyAttachment(registerName('ServerRPAInvokePolicy'), {
      role: iamForLambda.name,
      policyArn: policy.arn,
    })
  }

  return iamForLambda
}

export function buildRouter(
  iamForLambda: aws.iam.Role,
  routerPath: string,
): aws.lambda.Function {
  const routerHandler = new aws.lambda.Function(
    registerName('LambdaRouterFunctionHandler'),
    {
      code: new pulumi.asset.FileArchive(routerPath),
      role: iamForLambda.arn,
      handler: 'router.handler',
      runtime: 'nodejs18.x',
      memorySize: 128,
      publish: true,
    },
    { provider: eastRegion },
  )

  return routerHandler
}

export function validateCertificate(
  FQDN: string,
  domainName: string,
): pulumi.Output<string> {
  if (!FQDN.includes(domainName)) {
    throw new Error('FQDN must contain domainName')
  }

  const certificate = new aws.acm.Certificate(
    registerName('Certificate'),
    {
      domainName: FQDN,
      validationMethod: 'DNS',
    },
    { provider: eastRegion },
  )

  const hostedZone = aws.route53.getZone({
    name: domainName,
    privateZone: false,
  })

  const validationRecord = new aws.route53.Record(
    registerName(`${FQDN}.validation`),
    {
      name: certificate.domainValidationOptions[0].resourceRecordName,
      records: [certificate.domainValidationOptions[0].resourceRecordValue],
      ttl: 60,
      type: certificate.domainValidationOptions[0].resourceRecordType,
      zoneId: hostedZone.then((x) => x.zoneId),
    },
  )

  const certificateValidation = new aws.acm.CertificateValidation(
    registerName('CertificateValidation'),
    {
      certificateArn: certificate.arn,
      validationRecordFqdns: [validationRecord.fqdn],
    },
    { provider: eastRegion },
  )

  return certificateValidation.certificateArn
}

export function buildStatic(
  staticPath: string,
  prerenderedPath: string,
): aws.s3.Bucket {
  const bucket = new aws.s3.Bucket(registerName('StaticContentBucket'), {
    acl: 'private',
    forceDestroy: true,
  })
  exports.uploadStatic(staticPath, bucket)
  exports.uploadStatic(prerenderedPath, bucket)
  return bucket
}

// Sync the contents of the source directory with the S3 bucket, which will
// in-turn show up on the CDN.
export function uploadStatic(dirPath: string, bucket: aws.s3.Bucket) {
  // crawlDirectory recursive crawls the provided directory, applying the
  // provided function to every file it contains. Doesn't handle cycles from
  // symlinks.
  function crawlDirectory(dir: string, f: (_: string) => void) {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)
      if (stat.isDirectory()) {
        crawlDirectory(filePath, f)
      }
      if (stat.isFile()) {
        f(filePath)
      }
    }
  }

  console.log('Syncing contents from local disk at', dirPath)
  crawlDirectory(dirPath, (filePath: string) => {
    const relativeFilePath = filePath.replace(dirPath + path.sep, '')
    const posixFilePath = relativeFilePath.split(path.sep).join(path.posix.sep)
    const contentFile = new aws.s3.BucketObject(
      registerName(posixFilePath),
      {
        key: posixFilePath,
        bucket: bucket.id,
        contentType: mime.lookup(filePath) || undefined,
        source: new pulumi.asset.FileAsset(filePath),
      },
      {
        parent: bucket,
      },
    )
  })
}

export function buildCDN(
  routerFunction: aws.lambda.Function,
  bucket: aws.s3.Bucket,
  serverHeaders: string[],
  FQDN?: string,
  certificateArn?: pulumi.Input<string>,
): aws.cloudfront.Distribution {
  const defaultRequestPolicy = new aws.cloudfront.OriginRequestPolicy(
    registerName('DefaultRequestPolicy'),
    {
      cookiesConfig: {
        cookieBehavior: 'all',
      },
      headersConfig: {
        headerBehavior: 'whitelist',
        headers: {
          items: serverHeaders,
        },
      },
      queryStringsConfig: {
        queryStringBehavior: 'all',
      },
    },
  )

  const oac = new aws.cloudfront.OriginAccessControl(
    registerName('CloudFrontOriginAccessControl'),
    {
      description: 'Default Origin Access Control',
      name: 'CloudFrontOriginAccessControl',
      originAccessControlOriginType: 's3',
      signingBehavior: 'no-override',
      signingProtocol: 'sigv4',
    },
  )

  const optimizedCachePolicy = aws.cloudfront.getCachePolicyOutput({
    name: 'Managed-CachingOptimized',
  })

  const distribution = new aws.cloudfront.Distribution(
    registerName('CloudFrontDistribution'),
    {
      enabled: true,
      origins: [
        {
          originId: 'default',
          domainName: bucket.bucketRegionalDomainName,
          originAccessControlId: oac.id,
        },
      ],
      aliases: FQDN ? [FQDN] : undefined,
      priceClass: 'PriceClass_100',
      viewerCertificate: FQDN
        ? {
            // Per AWS, ACM certificate must be in the us-east-1 region.
            acmCertificateArn: certificateArn,
            sslSupportMethod: 'sni-only',
          }
        : {
            cloudfrontDefaultCertificate: true,
          },
      defaultCacheBehavior: {
        compress: true,
        viewerProtocolPolicy: 'redirect-to-https',
        allowedMethods: [
          'DELETE',
          'GET',
          'HEAD',
          'OPTIONS',
          'PATCH',
          'POST',
          'PUT',
        ],
        cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
        lambdaFunctionAssociations: [
          {
            eventType: 'origin-request',
            lambdaArn: pulumi
              .all([routerFunction.arn, routerFunction.version])
              .apply(([arn, version]) => {
                return `${arn}:${version}`
              }),
            includeBody: true,
          },
        ],
        originRequestPolicyId: defaultRequestPolicy.id,
        cachePolicyId: optimizedCachePolicy.apply((policy) => policy.id!),
        targetOriginId: 'default',
      },
      restrictions: {
        geoRestriction: {
          restrictionType: 'none',
        },
      },
    },
  )

  const cloudFrontPolicyDocument = aws.iam.getPolicyDocumentOutput({
    statements: [
      {
        principals: [
          {
            type: 'Service',
            identifiers: ['cloudfront.amazonaws.com'],
          },
        ],
        actions: ['s3:GetObject'],
        resources: [pulumi.interpolate`${bucket.arn}/\*`],
        conditions: [
          {
            test: 'StringEquals',
            variable: 'AWS:SourceArn',
            values: [distribution.arn],
          },
        ],
      },
      {
        principals: [
          {
            type: 'AWS',
            identifiers: ['*'],
          },
        ],
        actions: ['s3:*'],
        effect: 'Deny',
        resources: [pulumi.interpolate`${bucket.arn}/\*`, bucket.arn],
        conditions: [
          {
            test: 'Bool',
            variable: 'aws:SecureTransport',
            values: ['false'],
          },
        ],
      },
    ],
  })

  const cloudFrontBucketPolicy = new aws.s3.BucketPolicy(
    registerName('CloudFrontBucketPolicy'),
    {
      bucket: bucket.id,
      policy: cloudFrontPolicyDocument.apply((policy) => policy.json),
    },
  )

  return distribution
}

// Creates a new Route53 DNS record pointing the domain to the CloudFront
// distribution.
export function createAliasRecord(
  targetDomain: string,
  distribution: aws.cloudfront.Distribution,
): aws.route53.Record {
  const domainParts = exports.getDomainAndSubdomain(targetDomain)
  const hostedZoneId = aws.route53
    .getZone({ name: domainParts.parentDomain }, { async: true })
    .then((zone) => zone.zoneId)
  return new aws.route53.Record(registerName(targetDomain), {
    name: domainParts.subdomain,
    zoneId: hostedZoneId,
    type: 'A',
    aliases: [
      {
        name: distribution.domainName,
        zoneId: distribution.hostedZoneId,
        evaluateTargetHealth: true,
      },
    ],
  })
}

// Split a domain name into its subdomain and parent domain names.
// e.g. "www.example.com" => "www", "example.com".
export function getDomainAndSubdomain(domain: string): {
  subdomain: string
  parentDomain: string
} {
  const parts = domain.split('.')
  if (parts.length < 2) {
    throw new Error(`No TLD found on ${domain}`)
  }
  // No subdomain, e.g. awesome-website.com.
  if (parts.length === 2) {
    return { subdomain: '', parentDomain: domain }
  }
  const subdomain = parts[0]
  parts.shift() // Drop first element.
  return {
    subdomain,
    // Trailing "." to canonicalize domain.
    parentDomain: parts.join('.') + '.',
  }
}

// Source: https://www.pulumi.com/blog/next-level-iac-pulumi-runtime-logic/
export function createInvalidation(id: string) {
  // Only invalidate after a deployment.
  if (pulumi.runtime.isDryRun()) {
    console.log('This is a Pulumi preview, so skipping cache invalidation.')
    return
  }

  const region = pulumiConfig.require('region')

  process.on('beforeExit', () => {
    const client = new cloudfront.CloudFrontClient({ region })
    const command = new cloudfront.CreateInvalidationCommand({
      DistributionId: id,
      InvalidationBatch: {
        CallerReference: `invalidation-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
      },
    })

    client
      .send(command)
      .then((result) => {
        console.log(
          `Invalidation status for ${id}: ${result.Invalidation?.Status}.`,
        )
        process.exit(0)
      })
      .catch((error) => {
        console.error(error)
        process.exit(1)
      })
  })
}
