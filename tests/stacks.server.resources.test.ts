import * as fs from 'fs'
import * as path from 'path'

import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'

import { MyMocks, promiseOf, findResource, getTempDir } from './utils'

describe('stacks/server/resources.ts', () => {
  let infra: typeof import('../stacks/server/resources')
  let mocks: MyMocks

  beforeEach(async () => {
    vi.resetModules()
    mocks = new MyMocks()
    pulumi.runtime.setMocks(mocks)
    infra = await import('../stacks/server/resources')
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

  it('buildLambda', async () => {
    const memorySize = 128
    const serverPath = 'mock'

    const iamForLambda = infra.getLambdaRole()
    const functionURL = infra.buildLambda(
      'mock',
      iamForLambda,
      serverPath,
      {},
      memorySize
    )

    const protocolType = await promiseOf(httpApi.protocolType)
    const expectedApiId = await promiseOf(httpApi.id)
    const executionArn = await promiseOf(httpApi.executionArn)

    expectTypeOf(httpApi).toEqualTypeOf<aws.apigatewayv2.Api>()
    expect(protocolType).toMatch('HTTP')

    const routeKey = await promiseOf(defaultRoute.routeKey)
    const routeApiId = await promiseOf(defaultRoute.apiId)

    await new Promise((r) => setTimeout(r, 1000))

    expectTypeOf(defaultRoute).toEqualTypeOf<aws.apigatewayv2.Route>()
    expect(routeKey).toMatch('$default')
    expect(routeApiId).toMatch(expectedApiId)

    const target = await promiseOf(defaultRoute.target)
    const integrationMatch = target!.match('integrations/(.*?)-id')
    const serverIntegrationName = integrationMatch![1]

    expect(mocks.resources).toHaveProperty(serverIntegrationName)
    const serverIntegration = mocks.resources[serverIntegrationName]

    expect(serverIntegration.type).toMatch(
      'aws:apigatewayv2/integration:Integration'
    )
    expect(serverIntegration.apiId).toMatch(expectedApiId)
    expect(serverIntegration.integrationMethod).toMatch('POST')
    expect(serverIntegration.integrationType).toMatch('AWS_PROXY')
    expect(serverIntegration.payloadFormatVersion).toMatch('1.0')

    const lambdaMatch = serverIntegration.integrationUri.match('(.*?)-arn')
    const lambdaIntegrationName = lambdaMatch![1]

    expect(mocks.resources).toHaveProperty(lambdaIntegrationName)
    const lambda = mocks.resources[lambdaIntegrationName]
    const iamArn = await promiseOf(iamForLambda.arn)
    const codePath = await lambda.code.path

    expect(lambda.type).toMatch('aws:lambda/function:Function')
    expect(lambda.handler).toMatch('index.handler')
    expect(lambda.memorySize).toEqual(memorySize)
    expect(lambda.runtime).toMatch('nodejs16.x')
    expect(lambda.timeout).toEqual(900)
    expect(lambda.role).toMatch(iamArn)
    expect(codePath).toMatch(serverPath)

    // Can't access role in mock outputs for RolePolicyAttachment
    const RPA = findResource(
      mocks,
      'aws:iam/rolePolicyAttachment:RolePolicyAttachment'
    )
    expect(RPA).toBeDefined()
    expect(RPA!.policyArn).toMatch(
      'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
    )

    const serverPermission = findResource(
      mocks,
      'aws:lambda/permission:Permission'
    )
    expect(serverPermission).toBeDefined()
    expect(serverPermission!.action).toMatch('lambda:InvokeFunction')
    expect(serverPermission!.principal).toMatch('apigateway.amazonaws.com')

    const sourceArnMatch = serverPermission!.sourceArn.match('(.*?)/\\*/\\*')
    const sourceArn = sourceArnMatch![1]
    expect(sourceArn).toMatch(executionArn)

    const functionId = await promiseOf(serverPermission!.function.id)
    expect(functionId).toMatch(lambda.id)
  })

})
