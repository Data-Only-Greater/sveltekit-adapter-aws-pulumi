#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { join } from 'path';
import { config } from 'dotenv';
import { AWSAdapterProps } from '../adapter';

const env = config({ path: join(process.cwd(), '.env') }).parsed;
const artifactPath = 'build';
const static_directory = join(artifactPath, 'assets');
const prerendered_directory = join(artifactPath, 'prerendered');
const server_directory = join(artifactPath, 'server');

var argv = require('minimist')(process.argv.slice(2));
if (argv._.length) {
  const artifactPath = argv._[0];
}

const adapterProps: AWSAdapterProps = require(`${artifactPath}/.adapterprops.json`);

if (adapterProps.iac === 'cdk') {
  spawnSync('npx', ['cdk', 'destroy', '--app', `${__dirname}/../deploy/index.js`, '*', '--force'], {
    cwd: __dirname,
    stdio: [process.stdin, process.stdout, process.stderr],
    env: Object.assign(
      {
        SERVER_PATH: join(process.cwd(), server_directory),
        STATIC_PATH: join(process.cwd(), static_directory),
        PRERENDERED_PATH: join(process.cwd(), prerendered_directory),
        ...env,
      },
      process.env
    ),
  });
} else if (adapterProps.iac === 'pulumi') {
  spawnSync('pulumi', ['destroy', '-f', '-s', adapterProps.stackName!, '-y'], {
    cwd: adapterProps.pulumiProjectPath,
    stdio: [process.stdin, process.stdout, process.stderr],
    env: process.env,
  });
}
