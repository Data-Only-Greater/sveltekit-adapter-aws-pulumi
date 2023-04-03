import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomUUID } from 'crypto'

import * as pulumi from '@pulumi/pulumi'
import { Mocks } from '@pulumi/pulumi/runtime'

export class MyMocks implements Mocks {
  public resources: { [key: string]: Record<string, any> } = {}
  private noNameTest: string[] = [
    'aws:route53/record:Record',
    'aws:s3/bucketObject:BucketObject'
  ]
  newResource(args: pulumi.runtime.MockResourceArgs): {
    id: string | undefined
    state: Record<string, any>
  } {
    console.log(args.type)
    
    if (!validName(args.name) && !this.noNameTest.includes(args.type)) {
      throw Error(`'${args.name}' is not a valid value for the name field`)
    }
    const id = `${args.name}-id`
    const outputs = {
      id: id,
      state: {
        ...args.inputs,
        executionArn: `${args.name}-executionArn`,
        arn: `${args.name}-arn`,
        zoneId: `${args.name}-zone`,
        domainName: 'example.com',
        fqdn: 'server.example.com',
        hostedZoneId: `${args.name}-hostedZone`,
        apiEndpoint: 'https://example.com',
        domainValidationOptions: [
          {
            resourceRecordName: `${args.name}-resourceRecordName`,
            resourceRecordValue: `${args.name}-resourceRecordValue`,
          },
        ],
        bucketRegionalDomainName: 'bucket.s3.mock-west-1.amazonaws.com',
      },
    }
    const resource: Record<string, any> = {
      id,
      type: args.type,
      provider: args.provider,
      ...outputs.state,
    }
    this.resources[args.name] = resource
    return outputs
  }
  call(args: pulumi.runtime.MockCallArgs): Record<string, any> {
    const result = { id: `${args.token}-id`, ...args.inputs }
    if (args.token == 'aws:iam/getPolicyDocument:getPolicyDocument') {
      result['json'] = JSON.stringify(args.inputs)
    }
    return result
  }
}

export function validName(name: string): boolean {
  console.log(name)
  const regex_valid = new RegExp('^[A-Za-z0-9-]*(?<!-)$')
  const regex_double = new RegExp('--')
  return regex_valid.test(name) && !(regex_double.test(name))
}

// Convert a pulumi.Output to a promise of the same type.
export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve))
}

export function findResource(
  mocks: MyMocks,
  resourceType: string
): Record<string, any> | undefined {
  for (const resource in mocks.resources) {
    if (mocks.resources[resource].type === resourceType) {
      return mocks.resources[resource]
    }
  }
  return undefined
}

export function getTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), randomUUID()))
}
