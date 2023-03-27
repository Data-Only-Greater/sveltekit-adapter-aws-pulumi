import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';

import * as pulumi from '@pulumi/pulumi';
import { Mocks } from '@pulumi/pulumi/runtime';

export class MyMocks implements Mocks {
  public resources: { [key: string]: Record<string, any> } = {};
  newResource(args: pulumi.runtime.MockResourceArgs): {
    id: string | undefined;
    state: Record<string, any>;
  } {
    const id = `${args.name}-id`;
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
    };
    const resource: Record<string, any> = {
      id,
      type: args.type,
      provider: args.provider,
      ...outputs.state,
    };
    this.resources[args.name] = resource;
    return outputs;
  }
  call(args: pulumi.runtime.MockCallArgs): Record<string, any> {
    const result = { id: `${args.token}-id`, ...args.inputs };
    if (args.token == 'aws:iam/getPolicyDocument:getPolicyDocument') {
      result['json'] = JSON.stringify(args.inputs);
    }
    return result;
  }
}

// Convert a pulumi.Output to a promise of the same type.
export function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

export function findResource(mocks: MyMocks, resourceType: string): Record<string, any> | undefined {
  for (const resource in mocks.resources) {
    if (mocks.resources[resource].type === resourceType) {
      return mocks.resources[resource];
    }
  }
  return undefined;
}

export function getTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), randomUUID()));
}
