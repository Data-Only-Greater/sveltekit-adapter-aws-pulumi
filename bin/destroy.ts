#!/usr/bin/env node

import * as path from 'path'
import { realpathSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync, SpawnSyncReturns } from 'child_process'
import { createRequire } from 'module'

import yargs from 'yargs/yargs'

import { AWSAdapterProps } from '../adapter'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

interface Arguments {
  [x: string]: unknown
  _: (string | number)[]
  $0: string
  s: string | undefined
  'default-projects': string | undefined
}

export async function main(args: string[]): Promise<void> {
  let pulumiPaths: string[] | undefined
  let stackName: string | undefined

  var argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 [options] <artifactPath>')
    .command('$0', '', (yargs) => {
      yargs
        .positional('artifactPath', {
          describe: 'directory containing the build artifacts',
          type: 'string',
        })
        .option('s', {
          describe: 'stack name',
          type: 'string',
        })
        .option('default-projects', {
          describe: 'use the built-in Pulumi projects',
          type: 'boolean',
        })
    })
    .alias('h', 'help')
    .help()
    .parseSync() as Arguments

  console.log(argv)

  let artifactPath = 'build'

  if (argv._.length) {
    artifactPath = String(argv._[0])
  }

  const absArtifactPath = path.resolve(process.cwd(), artifactPath)
  const propsPath = path.join(absArtifactPath, '.adapterprops.json')

  const require = createRequire(import.meta.url)
  let adapterProps: AWSAdapterProps

  try {
    adapterProps = require(propsPath)
    pulumiPaths = adapterProps.pulumiPaths
    stackName = adapterProps.stackName
  } catch (error: any) {
    if (!error.message.includes('Cannot find module')) {
      throw error
    }
  }

  if ('default-projects' in argv) {
    const serverPath = path.resolve(__dirname, '..', 'stacks', 'server')
    const mainPath = path.resolve(__dirname, '..', 'stacks', 'main')
    pulumiPaths = [serverPath, mainPath]
  }

  if ('s' in argv) {
    stackName = argv.s
  }

  let abort: boolean = false

  if (pulumiPaths === undefined) {
    console.log('Paths to pulumi projects could not be determined.')
    abort = true
  }

  if (pulumiPaths === undefined) {
    console.log('Stack name could not be determined')
    abort = true
  }

  if (abort) {
    console.log('Aborting')
    return
  }

  const maxRetries: number = 3
  let retries: number
  let exitCode: number
  let comRes: SpawnSyncReturns<Buffer>

  for (const pulumiPath of pulumiPaths!) {
    retries = 0
    exitCode = 1

    if ('f' in argv || 'force' in argv) {
      spawnSync('pulumi', ['cancel', '-s', stackName!, '-y'], {
        cwd: pulumiPath,
        stdio: [process.stdin, process.stdout, process.stderr],
        env: process.env,
      })
    }

    while (exitCode !== 0 && retries <= maxRetries) {
      if (retries > 0) {
        console.log(`Retry ${retries} of ${maxRetries}`)
      }

      comRes = spawnSync(
        'pulumi',
        ['destroy', '-f', '-s', stackName!, '-y', '--refresh'],
        {
          cwd: pulumiPath,
          stdio: [process.stdin, process.stdout, process.stderr],
          env: process.env,
        }
      )

      if (comRes.status === null) {
        exitCode = 0
      } else {
        exitCode = comRes.status
      }

      retries += 1
    }
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
