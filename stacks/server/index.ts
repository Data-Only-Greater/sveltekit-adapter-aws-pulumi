import * as pulumi from '@pulumi/pulumi'

import { getLambdaRole, buildLambda } from './resources.js'
import { getEnvironment } from '../utils.js'

const pulumiConfig = new pulumi.Config()
const projectPath = pulumiConfig.get('projectPath')
const serverPath = pulumiConfig.get('serverPath')
const optionsPath = pulumiConfig.get('optionsPath')
const memorySizeStr = pulumiConfig.get('memorySize')
const allowedOriginsStr = pulumiConfig.get('allowedOrigins')
let serverInvokeMode = pulumiConfig.get('serverInvokeMode')

const memorySize = Number(memorySizeStr!)

let optionsEnv: any = {}

if (allowedOriginsStr) {
  optionsEnv['ALLOWED_ORIGINS'] = allowedOriginsStr
}

if (!serverInvokeMode) {
  serverInvokeMode = 'BUFFERED'
}

const iamForLambda = getLambdaRole()
const environment = getEnvironment(projectPath!)

const serverURL = buildLambda(
  'LambdaServer',
  iamForLambda,
  serverPath!,
  environment.parsed,
  memorySize,
  serverInvokeMode,
)

const optionsURL = buildLambda(
  'LambdaOptions',
  iamForLambda,
  optionsPath!,
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
