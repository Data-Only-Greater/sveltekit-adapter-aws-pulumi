import * as pulumi from '@pulumi/pulumi'

import {
  getLambdaRole,
  buildRouter,
  validateCertificate,
  buildStatic,
  buildCDN,
  createAliasRecord,
  createInvalidation,
} from './resources.js'

const pulumiConfig = new pulumi.Config()
const edgePath = pulumiConfig.require('edgePath')
const staticPath = pulumiConfig.require('staticPath')
const prerenderedPath = pulumiConfig.require('prerenderedPath')
const serverArn = pulumiConfig.require('serverArn')
const optionsArn = pulumiConfig.require('optionsArn')
const FQDN = pulumiConfig.get('FQDN')
const serverHeadersStr = pulumiConfig.get('serverHeaders')

let serverHeaders: string[] = []

if (serverHeadersStr) {
  serverHeaders = JSON.parse(serverHeadersStr)
}

const iamForLambda = getLambdaRole([serverArn, optionsArn])
const routerHandler = buildRouter(iamForLambda, edgePath)

let certificateArn: pulumi.Input<string> | undefined

if (FQDN) {
  const [_, zoneName, ...MLDs] = FQDN.split('.')
  const domainName = [zoneName, ...MLDs].join('.')
  certificateArn = validateCertificate(FQDN, domainName)
}

const bucket = buildStatic(staticPath, prerenderedPath)
const distribution = buildCDN(
  routerHandler,
  bucket,
  serverHeaders,
  FQDN,
  certificateArn,
)

if (FQDN) {
  createAliasRecord(FQDN, distribution)
}

var getOrigins: (string | pulumi.Output<string>)[] = [
  pulumi.interpolate`https://${distribution.domainName}`,
]
FQDN && getOrigins.push(`https://${FQDN}`)

distribution.id.apply((id) => createInvalidation(id))

export const allowedOrigins = getOrigins
export const appUrl = FQDN
  ? `https://${FQDN}`
  : pulumi.interpolate`https://${distribution.domainName}`
