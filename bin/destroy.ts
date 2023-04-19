#!/usr/bin/env node

import * as path from 'path'
import { realpathSync } from 'fs'
import { pathToFileURL } from 'url'
import { spawnSync } from 'child_process'
import { createRequire } from 'node:module'

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
      throw error
    }
  }

  for (const pulumiPath of adapterProps.pulumiPaths!) {
    spawnSync(
      'pulumi',
      ['destroy', '-f', '-s', adapterProps.stackName!, '-y', '--refresh'],
      {
        cwd: pulumiPath,
        stdio: [process.stdin, process.stdout, process.stderr],
        env: process.env,
      }
    )
  }
}

function wasCalledAsScript(): boolean {
  const realPath = realpathSync(process.argv[1])
  const realPathAsUrl = pathToFileURL(realPath).href
  return import.meta.url === realPathAsUrl
}

if (wasCalledAsScript()) {
  main(process.argv)
}
