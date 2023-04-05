import * as pulumi from '@pulumi/pulumi'

import {
  getLambdaRole,
  buildServer,
  buildRouter,
  validateCertificate,
  buildStatic,
  buildCDN,
  createAliasRecord,
  buildInvalidator,
} from './resources'
import { getEnvironment } from './utils'

const projectPath = process.env.PROJECT_PATH!
const serverPath = process.env.SERVER_PATH!
const edgePath = process.env.EDGE_PATH!
const staticPath = process.env.STATIC_PATH!
const prerenderedPath = process.env.PRERENDERED_PATH!
const memorySize = parseInt(process.env.MEMORY_SIZE!) || 128
const [_, zoneName, ...MLDs] = process.env.FQDN?.split('.') || []
const domainName = [zoneName, ...MLDs].join('.')
const serverHeaders = process.env.SERVER_HEADERS?.split(',') || []
const staticHeaders = process.env.STATIC_HEADERS?.split(',') || []

const iamForLambda = getLambdaRole()
const environment = getEnvironment(projectPath)
const serverURL = buildServer(
  iamForLambda,
  serverPath,
  memorySize,
  environment
)
const routerHandler = buildRouter(iamForLambda, edgePath)

let certificateArn: pulumi.Input<string> | undefined

if (process.env.FQDN) {
  certificateArn = validateCertificate(process.env.FQDN, domainName)
}

const bucket = buildStatic(staticPath, prerenderedPath)
const distribution = buildCDN(
  serverURL,
  routerHandler,
  bucket,
  serverHeaders,
  process.env.FQDN,
  certificateArn
)

if (process.env.FQDN) {
  createAliasRecord(process.env.FQDN, distribution)
}

var allowedOrigins: (string | pulumi.Output<string>)[] = [
  pulumi.interpolate`https://${distribution.domainName}`,
]
process.env.FQDN && allowedOrigins.push(`https://${process.env.FQDN}`)

buildInvalidator(distribution, staticPath, prerenderedPath)

export const appUrl = process.env.FQDN
  ? `https://${process.env.FQDN}`
  : pulumi.interpolate`https://${distribution.domainName}`
