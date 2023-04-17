import * as pulumi from '@pulumi/pulumi'

import {
  getLambdaRole,
  buildRouter,
  validateCertificate,
  buildStatic,
  buildCDN,
  createAliasRecord,
  buildInvalidator,
} from './resources'

const pulumiConfig = new pulumi.Config()
const edgePath = pulumiConfig.get('edgePath')
const staticPath = pulumiConfig.get('staticPath')
const prerenderedPath = pulumiConfig.get('prerenderedPath')
const FQDN = pulumiConfig.get('FQDN')
const serverHeadersStr = pulumiConfig.get('serverHeaders')
const serverArn = pulumiConfig.get('serverArn')
const optionsArn = pulumiConfig.get('optionsArn')

const [_, zoneName, ...MLDs] = FQDN!.split('.') || []
const domainName = [zoneName, ...MLDs].join('.')

let serverHeaders: string[] = []

if (serverHeadersStr) {
  serverHeaders = JSON.parse(serverHeadersStr)
}

const iamForLambda = getLambdaRole([serverArn!, optionsArn!])
const routerHandler = buildRouter(iamForLambda, edgePath!)

let certificateArn: pulumi.Input<string> | undefined

if (FQDN) {
  certificateArn = validateCertificate(FQDN!, domainName)
}

const bucket = buildStatic(staticPath!, prerenderedPath!)
const distribution = buildCDN(
  routerHandler,
  bucket,
  serverHeaders,
  FQDN,
  certificateArn
)

if (FQDN) {
  createAliasRecord(FQDN, distribution)
}

var getOrigins: (string | pulumi.Output<string>)[] = [
  pulumi.interpolate`https://${distribution.domainName}`,
]
FQDN && getOrigins.push(`https://${FQDN}`)

buildInvalidator(distribution, staticPath!, prerenderedPath!)

export const allowedOrigins = getOrigins
export const appUrl = FQDN
  ? `https://${FQDN}`
  : pulumi.interpolate`https://${distribution.domainName}`
