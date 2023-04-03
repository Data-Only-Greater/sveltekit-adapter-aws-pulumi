#!/usr/bin/env node

import * as path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

import parseArgs from 'minimist'

import { AWSAdapterProps } from '../adapter'

export async function main(args: string[]): Promise<void> {
  let artifactPath = 'build'
  const argv = parseArgs(args.slice(2))
  if (argv._.length) {
    artifactPath = argv._[0]
  }

  const propsPath = path.resolve(
    process.cwd(),
    artifactPath,
    '.adapterprops.json'
  )

  const adapterProps: AWSAdapterProps = await import(propsPath)

  spawnSync('pulumi', ['destroy', '-f', '-s', adapterProps.stackName!, '-y'], {
    cwd: adapterProps.pulumiPath,
    stdio: [process.stdin, process.stdout, process.stderr],
    env: process.env,
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv)
}
