import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { DotenvConfigOutput } from 'dotenv'

import { NameRegister } from '../utils'

const nameRegister = NameRegister.getInstance()
let registerName = (name: string): string => {
  return nameRegister.registerName(name)
}

export function getLambdaRole(): aws.iam.Role {
  const iamForLambda = new aws.iam.Role(registerName('IamForLambda'), {
    assumeRolePolicy: `{
          "Version": "2012-10-17",
          "Statement": [
            {
              "Action": "sts:AssumeRole",
              "Principal": {
                "Service": [
                  "lambda.amazonaws.com"
                ]
              },
              "Effect": "Allow",
              "Sid": ""
            }
          ]
        }
        `,
  })

  const RPA = new aws.iam.RolePolicyAttachment(
    registerName('ServerRPABasicExecutionRole'),
    {
      role: iamForLambda.name,
      policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    }
  )

  return iamForLambda
}

export function buildLambda(
  name: string,
  iamForLambda: aws.iam.Role,
  codePath: string,
  environment: object = {},
  memorySize: number = 128
): aws.lambda.FunctionUrl {
  const lambdaHandler = new aws.lambda.Function(registerName(name), {
    code: new pulumi.asset.FileArchive(codePath),
    role: iamForLambda.arn,
    handler: 'index.handler',
    runtime: 'nodejs18.x',
    timeout: 900,
    memorySize: memorySize,
    environment: {
      variables: {
        ...environment,
      } as any,
    },
  })

  const lambdaURL = new aws.lambda.FunctionUrl(`${name}URL`, {
    functionName: lambdaHandler.arn,
    authorizationType: 'NONE',
  })

  return lambdaURL
}
