#!/usr/bin/env node

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { createRequire } from 'node:module';

import parseArgs from 'minimist'

import { AWSAdapterProps } from '../adapter'

export async function main(args: string[]): Promise<void> {
  let artifactPath = 'build'
  const argv = parseArgs(args.slice(2))
  if (argv._.length) {
    artifactPath = argv._[0]
  }
  
  const absArtifactPath = path.resolve(process.cwd(), artifactPath)
  const propsPath = path.join(absArtifactPath, '.adapterprops.json')
  
  const require = createRequire(import.meta.url)
  let adapterProps: AWSAdapterProps
  
  try {
    adapterProps = require(propsPath)
  } catch (error: any) {
    if (error.message.includes('Cannot find module')) {
      return
    } else {
      throw(error)
    }
  }

  spawnSync('pulumi', ['destroy', '-f', '-s', adapterProps.stackName!, '-y'], {
    cwd: adapterProps.pulumiPath,
    stdio: [process.stdin, process.stdout, process.stderr],
    env: process.env,
  })
  
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv)
}
