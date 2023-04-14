import * as fs from 'fs'
import * as path from 'path'

import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

import { MyMocks, promiseOf, findResource, getTempDir } from './utils'

describe('stacks/main/resources.ts', () => {
  let infra: typeof import('../stacks/main/resources')
  let mocks: MyMocks

  beforeEach(async () => {
    vi.resetModules()
    mocks = new MyMocks()
    pulumi.runtime.setMocks(mocks)
    infra = await import('../stacks/main/resources')
  })

  it('getLambdaRole', async () => {
    const test = infra.getLambdaRole()
    const assumeRolePolicy = await promiseOf(test.assumeRolePolicy)
    const statement = JSON.parse(assumeRolePolicy).Statement[0]

    expectTypeOf(test).toEqualTypeOf<aws.iam.Role>()
    expect(statement.Action).toMatch('sts:AssumeRole')
    expect(statement.Effect).toMatch('Allow')
    expect(statement.Principal.Service).toMatch('lambda.amazonaws.com')
  })

  it('validateCertificate-Wrong-Domain', async () => {
    const FQDN = 'server.example.com'
    const domainName = 'another.com'
    expect(() => infra.validateCertificate(FQDN, domainName)).toThrowError(
      'FQDN must contain domainName'
    )
  })

  // Not sure how to capture the provider for the certificate or the pre-existing hosted zone
  it('validateCertificate', async () => {
    const FQDN = 'server.example.com'
    const domainName = 'example.com'

    const certificateArn = await promiseOf(
      infra.validateCertificate(FQDN, domainName)
    )
    const certificateValidation = findResource(
      mocks,
      'aws:acm/certificateValidation:CertificateValidation'
    )

    expect(certificateValidation!.certificateArn).toMatch(certificateArn)
    expect(certificateValidation!.validationRecordFqdns[0]).toMatch(
      'server.example.com'
    )

    const validationRecord = findResource(mocks, 'aws:route53/record:Record')
    const certificateMatch = validationRecord!.name.match(
      '(.*?)-resourceRecordName'
    )
    const certificateName = certificateMatch![1]

    expect(mocks.resources).toHaveProperty(certificateName)
    const certificate = mocks.resources[certificateName]

    // The type input to aws:route53/record:Record isn't handled
    expect(certificate.type).toMatch('aws:acm/certificate:Certificate')
    expect(certificate.domainName).toMatch(domainName)
    expect(certificate.validationMethod).toMatch('DNS')

    expect(validationRecord!.name).toMatch(
      certificate.domainValidationOptions[0].resourceRecordName
    )
    expect(validationRecord!.records[0]).toMatch(
      certificate.domainValidationOptions[0].resourceRecordValue
    )
    expect(validationRecord!.ttl).toEqual(60)
    expect(validationRecord!.zoneId).toMatch(`${FQDN}.validation-zone`)
  })

  it('uploadStatic', async () => {
    const tmpDir = getTempDir()
    const childDir = path.join(tmpDir, 'child')

    fs.mkdirSync(childDir)
    fs.closeSync(fs.openSync(path.join(tmpDir, 'a.mock'), 'w'))
    fs.closeSync(fs.openSync(path.join(childDir, 'b.mock'), 'w'))

    const bucket = new aws.s3.Bucket('MockBucket')
    const bucketId = await promiseOf(bucket.id)
    infra.uploadStatic(tmpDir, bucket)

    fs.rmSync(tmpDir, { recursive: true })

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100))
    var fileArray = ['a.mock', path.join('child', 'b.mock')]

    for (const fileName of fileArray) {
      const posixFilePath = fileName.split(path.sep).join(path.posix.sep)
      expect(mocks.resources).toHaveProperty(posixFilePath)

      const item = mocks.resources[posixFilePath]
      expect(item.type).toMatch('aws:s3/bucketObject:BucketObject')
      expect(item.key).toMatch(posixFilePath)
      expect(item.bucket).toMatch(bucketId)

      const sourcePath = await item.source.path
      expect(sourcePath).toContain(fileName)
    }
  })

  it('buildStatic', async () => {
    const spy = vi.spyOn(infra, 'uploadStatic').mockImplementation(() => null)
    infra.buildStatic('mock', 'mock')
    expect(spy).toHaveBeenCalledTimes(2)

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100))
    
    console.log(Object.keys(mocks.resources))
    expect(Object.keys(mocks.resources)).toHaveLength(2)
    const resource = Object.values(mocks.resources)[0]

    expect(resource.type).toMatch('aws:s3/bucket:Bucket')
    expect(resource.acl).toMatch('private')
    expect(resource.forceDestroy).toBe(true)
  })

  it('buildCDN', async () => {
    const router = new aws.lambda.Function('MockAPI', {
      role: 'mock'
    })
    const bucket = new aws.s3.Bucket('MockBucket')
    const routes = ['mock/*', 'another/*']
    const serverHeaders = ['mock1', 'mock2']
    const staticHeaders = ['mock3']
    const FQDN = 'server.example.com'
    const certificateArn = 'MockCertificateArn'
    const bucketId = await promiseOf(bucket.id)
    const bucketArn = await promiseOf(bucket.arn)

    const distribution = infra.buildCDN(
      router,
      bucket,
      serverHeaders,
      FQDN,
      certificateArn
    )

    const distOrigins = await promiseOf(distribution.origins)
    expect(distOrigins).toHaveLength(1)

    let s3OriginIndex: number | undefined

    for (const [i, value] of distOrigins.entries()) {
      if (value.hasOwnProperty('originAccessControlId')) {
        s3OriginIndex = i
        break
      }
    }

    expect(s3OriginIndex).toBeDefined()
    const s3Origin = distOrigins[s3OriginIndex!]

    expect(s3Origin.domainName).toMatch('bucket.s3.mock-west-1.amazonaws.com')

    const oacMatch = s3Origin.originAccessControlId!.match('(.*?)-id')
    const oacName = oacMatch![1]
    const oac = mocks.resources[oacName]

    expect(oac.type).toMatch(
      'aws:cloudfront/originAccessControl:OriginAccessControl'
    )
    expect(oac.originAccessControlOriginType).toMatch('s3')
    expect(oac.signingBehavior).toMatch('always')
    expect(oac.signingProtocol).toMatch('sigv4')

    const distAliases = await promiseOf(distribution.aliases)
    const distEnabled = await promiseOf(distribution.enabled)
    const distViewerCertificate = await promiseOf(
      distribution.viewerCertificate
    )
    const distDefaultCacheBehavior = await promiseOf(
      distribution.defaultCacheBehavior
    )
    const distOrderedCacheBehaviors = await promiseOf(
      distribution.orderedCacheBehaviors
    )
    const distArn = await promiseOf(distribution.arn)

    expect(distAliases).toContain(FQDN)
    expect(distEnabled).toBe(true)
    expect(distViewerCertificate.acmCertificateArn).toMatch(certificateArn)
    expect(distViewerCertificate.sslSupportMethod).toMatch('sni-only')
    expect(distDefaultCacheBehavior.allowedMethods).toEqual([
      'DELETE',
      'GET',
      'HEAD',
      'OPTIONS',
      'PATCH',
      'POST',
      'PUT',
    ])
    expect(distDefaultCacheBehavior.cachedMethods).toEqual(['GET', 'HEAD', 'OPTIONS'])
    expect(distDefaultCacheBehavior.compress).toBe(true)
    expect(distDefaultCacheBehavior.viewerProtocolPolicy).toMatch(
      'redirect-to-https'
    )
    expect(distDefaultCacheBehavior.cachePolicyId).toMatch(
      'aws:cloudfront/getCachePolicy:getCachePolicy-id'
    )

    const originRequestPolicyMatch =
      distDefaultCacheBehavior.originRequestPolicyId!.match('(.*?)-id')
    const originRequestPolicyName = originRequestPolicyMatch![1]
    const originRequestPolicy = mocks.resources[originRequestPolicyName]
    
    expect(originRequestPolicy.type).toMatch(
      'aws:cloudfront/originRequestPolicy:OriginRequestPolicy'
    )
    expect(originRequestPolicy.cookiesConfig.cookieBehavior).toMatch('all')
    expect(originRequestPolicy.headersConfig.headerBehavior).toMatch(
      'whitelist'
    )
    expect(originRequestPolicy.headersConfig.headers.items).toEqual(
      serverHeaders
    )
    expect(originRequestPolicy.queryStringsConfig.queryStringBehavior).toMatch(
      'all'
    )

    // Need to wait for the mocks to update
    await new Promise((r) => setTimeout(r, 100))
    const bucketPolicy = findResource(mocks, 'aws:s3/bucketPolicy:BucketPolicy')
    const bucketPolicyWording = JSON.parse(bucketPolicy!.policy)

    expect(bucketPolicy!.bucket).toMatch(bucketId)
    expect(bucketPolicyWording.statements).toHaveLength(2)

    const getObjectStatement = bucketPolicyWording.statements[0]

    expect(getObjectStatement.actions).toEqual(['s3:GetObject'])
    expect(getObjectStatement.principals).toHaveLength(1)
    expect(getObjectStatement.principals[0].type).toMatch('Service')
    expect(getObjectStatement.principals[0].identifiers).toEqual([
      'cloudfront.amazonaws.com',
    ])
    expect(getObjectStatement.resources).toEqual([`${bucketArn}/*`])
    expect(getObjectStatement.conditions).toHaveLength(1)
    expect(getObjectStatement.conditions[0].test).toMatch('StringEquals')
    expect(getObjectStatement.conditions[0].variable).toMatch('AWS:SourceArn')
    expect(getObjectStatement.conditions[0].values).toEqual([distArn])

    const httpsStatement = bucketPolicyWording.statements[1]

    expect(httpsStatement.actions).toEqual(['s3:*'])
    expect(httpsStatement.effect).toMatch('Deny')
    expect(httpsStatement.principals).toHaveLength(1)
    expect(httpsStatement.principals[0].type).toMatch('AWS')
    expect(httpsStatement.principals[0].identifiers).toEqual(['*'])
    expect(httpsStatement.resources).toEqual([`${bucketArn}/*`, bucketArn])
    expect(httpsStatement.conditions).toHaveLength(1)
    expect(httpsStatement.conditions[0].test).toMatch('Bool')
    expect(httpsStatement.conditions[0].variable).toMatch('aws:SecureTransport')
    expect(httpsStatement.conditions[0].values).toEqual(['false'])
  })

  it('buildCDN (No FQDN)', async () => {
    const router = new aws.lambda.Function('MockAPI', {
      role: 'mock'
    })
    const bucket = new aws.s3.Bucket('MockBucket')
    const staticHeaders = ['mock3']

    const distribution = infra.buildCDN(
      router,
      bucket,
      staticHeaders
    )

    const distAliases = await promiseOf(distribution.aliases)
    const distViewerCertificate = await promiseOf(
      distribution.viewerCertificate
    )

    expect(distAliases).toBeUndefined()
    expect(distViewerCertificate.cloudfrontDefaultCertificate).toBe(true)
  })

  it('createAliasRecord', async () => {
    const hostedZoneId = 'mockZone-Id'
    const domainName = 'bob.com'
    const targetDomain = 'mock.example.com'
    const domainParts = targetDomain.split('.')
    const distribution: Partial<aws.cloudfront.Distribution> = {
      domainName: pulumi.Output.create(domainName),
      hostedZoneId: pulumi.Output.create(hostedZoneId),
    }

    const record = infra.createAliasRecord(
      targetDomain,
      <aws.cloudfront.Distribution>distribution
    )
    const recordName = await promiseOf(record.name)
    const recordZoneId = await promiseOf(record.zoneId)
    const recordType = await promiseOf(record.type)
    const recordAliases = await promiseOf(record.aliases)

    expect(recordName).toMatch(domainParts[0])
    expect(recordZoneId).toMatch(`${targetDomain}-zone`)
    expect(recordType).toMatch('A')

    expect(recordAliases).toHaveLength(1)
    expect(recordAliases![0].evaluateTargetHealth).toBe(true)
    expect(recordAliases![0].name).toMatch(domainName),
      expect(recordAliases![0].zoneId).toMatch(hostedZoneId)
  })

  it.each([
    ['www.example.com', 'www', 'example.com'],
    ['www.example.co.uk', 'www', 'example.co.uk'],
    ['example.com', '', 'example.com'],
  ])('getDomainAndSubdomain[%s]', async (domain, sub, parent) => {
    const { subdomain, parentDomain } = infra.getDomainAndSubdomain(domain)
    expect(subdomain).toMatch(sub)
    expect(parentDomain).toMatch(parent)
  })

})
