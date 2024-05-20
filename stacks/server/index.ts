import * as pulumi from '@pulumi/pulumi'

import { getLambdaRole, buildLambda } from './resources.js'

const pulumiConfig = new pulumi.Config()
const serverPath = pulumiConfig.require('serverPath')
const optionsPath = pulumiConfig.require('optionsPath')
const memorySizeStr = pulumiConfig.require('memorySize')
const allowedOriginsStr = pulumiConfig.get('allowedOrigins')
let serverInvokeMode = pulumiConfig.get('serverInvokeMode')

const memorySize = Number(memorySizeStr)

let optionsEnv: any = {}

if (allowedOriginsStr) {
  optionsEnv['ALLOWED_ORIGINS'] = allowedOriginsStr
}

if (!serverInvokeMode) {
  serverInvokeMode = 'BUFFERED'
}

const iamForLambda = getLambdaRole()

const serverURL = buildLambda(
  'LambdaServer',
  iamForLambda,
  serverPath,
  undefined,
  memorySize,
  serverInvokeMode,
)

const optionsURL = buildLambda(
  'LambdaOptions',
  iamForLambda,
  optionsPath,
  optionsEnv,
)

export const serverArn: pulumi.Output<string> = serverURL.functionArn
export const serverDomain: pulumi.Output<string> = serverURL.functionUrl.apply(
  (endpoint) => endpoint.split('://')[1].slice(0, -1),
)

export const optionsArn: pulumi.Output<string> = optionsURL.functionArn
export const optionsDomain: pulumi.Output<string> =
  optionsURL.functionUrl.apply((endpoint) =>
    endpoint.split('://')[1].slice(0, -1),
  )
