import * as pulumi from '@pulumi/pulumi'

import { getLambdaRole, buildLambda } from './resources'
import { getEnvironment } from '../utils'

const pulumiConfig = new pulumi.Config()
const projectPath = pulumiConfig.get('projectPath')
const serverPath = pulumiConfig.get('serverPath')
const optionsPath = pulumiConfig.get('optionsPath')
const memorySizeStr = pulumiConfig.get('memorySize')
const allowedOriginsStr = pulumiConfig.get('allowedOrigins')

let memorySize: number = 128

if (memorySizeStr) {
  memorySize = Number(memorySizeStr)
}

let optionsEnv: any = {}

if (allowedOriginsStr) {
  optionsEnv['ALLOWED_ORIGINS'] = allowedOriginsStr
}

const iamForLambda = getLambdaRole()
const environment = getEnvironment(projectPath!)

const serverURL = buildLambda(
  'LambdaServer',
  iamForLambda,
  serverPath!,
  environment.parsed,
  memorySize
)

const optionsURL = buildLambda(
  'LambdaOptions',
  iamForLambda,
  optionsPath!,
  optionsEnv
)

export const serverArn = serverURL.functionArn
export const serverDomain = serverURL.functionUrl.apply((endpoint) =>
  endpoint.split('://')[1].slice(0, -1)
)

export const optionsArn = optionsURL.functionArn
export const optionsDomain = optionsURL.functionUrl.apply((endpoint) =>
  endpoint.split('://')[1].slice(0, -1)
)
