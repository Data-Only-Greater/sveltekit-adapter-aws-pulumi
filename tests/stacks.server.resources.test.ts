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

    const functionName = await promiseOf(functionURL.functionName)
    const authorizationType = await promiseOf(functionURL.authorizationType)

    expectTypeOf(functionURL).toEqualTypeOf<aws.lambda.FunctionUrl>()
    expect(authorizationType).toMatch('AWS_IAM')
    
    console.log(functionName)
    const lambdaMatch = functionName.match('(.*?)-arn')
    const lambdaIntegrationName = lambdaMatch![1]

    expect(mocks.resources).toHaveProperty(lambdaIntegrationName)
    const lambda = mocks.resources[lambdaIntegrationName]
    const iamArn = await promiseOf(iamForLambda.arn)
    const codePath = await lambda.code.path

    expect(lambda.type).toMatch('aws:lambda/function:Function')
    expect(lambda.handler).toMatch('index.handler')
    expect(lambda.memorySize).toEqual(memorySize)
    expect(lambda.runtime).toMatch('nodejs18.x')
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
  })
})
