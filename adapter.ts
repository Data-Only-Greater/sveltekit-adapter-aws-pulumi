import { writeFileSync } from 'fs'
import { join } from 'path'
import * as url from 'url'

import {
  LocalProgramArgs,
  LocalWorkspace,
} from '@pulumi/pulumi/automation/index.js'
import {
  buildServer,
  buildOptions,
  buildRouter,
} from 'sveltekit-adapter-aws-base'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export interface AWSAdapterProps {
  artifactPath?: string
  autoDeploy?: boolean
  defaultHeaders?: string[]
  extraHeaders?: string[]
  esbuildOptions?: any
  FQDN?: string
  pulumiPaths?: string[]
  memorySize?: number
  region?: string
  stackName?: string
}

export function adapter({
  artifactPath = 'build',
  autoDeploy = false,
  defaultHeaders = [
    'Accept',
    'Accept-Language',
    'If-None-Match',
    'Host',
    'Origin',
    'Referer',
    'X-Forwarded-Host',
  ],
  extraHeaders = [],
  esbuildOptions = {},
  FQDN,
  memorySize,
  pulumiPaths = [],
  region = 'us-east-2',
  stackName = 'dev',
}: AWSAdapterProps = {}) {
  /** @type {import('@sveltejs/kit').Adapter} */
  return {
    name: 'adapter-aws-pulumi',
    async adapt(builder: any) {
      const { server_directory, static_directory, prerendered_directory } =
        await buildServer(builder, artifactPath, esbuildOptions)

      const options_directory = await buildOptions(builder, artifactPath)

      if (autoDeploy) {
        let adapterProps: AWSAdapterProps = {}

        builder.log.minor('Deploy using Pulumi.')

        // Setup server stack.
        const serverPath = join(__dirname, 'stacks', 'server')
        const serverArgs: LocalProgramArgs = {
          stackName: stackName,
          workDir: serverPath,
        }
        const serverStack = await LocalWorkspace.createOrSelectStack(
          serverArgs,
          {
            envVars: {
              TS_NODE_IGNORE: '^(?!.*(sveltekit-adapter-aws-pulumi)).*',
              TS_NODE_TYPE_CHECK: '0',
              PULUMI_NODEJS_TRANSPILE_ONLY: 'true',
            },
          }
        )

        // Set the AWS region.
        await serverStack.setConfig('aws:region', { value: region })

        await serverStack.setAllConfig({
          projectPath: { value: process.cwd() },
          serverPath: { value: server_directory },
          optionsPath: { value: options_directory },
          memorySizeStr: { value: String(memorySize) },
        })

        await serverStack.refresh()
        const serverStackUpResult = await serverStack.up({
          onOutput: console.info,
        })

        const edge_directory = await buildRouter(
          builder,
          static_directory,
          prerendered_directory,
          serverStackUpResult.outputs.serverDomain.value,
          serverStackUpResult.outputs.optionsDomain.value,
          artifactPath
        )

        // Setup main stack.
        const mainPath = join(__dirname, 'stacks', 'main')
        const mainArgs: LocalProgramArgs = {
          stackName: stackName,
          workDir: mainPath,
        }
        const mainStack = await LocalWorkspace.createOrSelectStack(mainArgs, {
          envVars: {
            TS_NODE_IGNORE: '^(?!.*(sveltekit-adapter-aws-pulumi)).*',
            TS_NODE_TYPE_CHECK: '0',
            PULUMI_NODEJS_TRANSPILE_ONLY: 'true',
          },
        })

        // Set the AWS region.
        await mainStack.setConfig('aws:region', { value: region })

        await mainStack.setAllConfig({
          edgePath: { value: edge_directory },
          staticPath: { value: static_directory },
          prerenderedPath: { value: prerendered_directory },
          serverArn: { value: serverStackUpResult.outputs.serverArn.value },
          optionsArn: { value: serverStackUpResult.outputs.optionsArn.value },
        })

        if (FQDN) {
          await mainStack.setConfig('FQDN', { value: FQDN })
        }

        let serverHeaders: string[] = [...defaultHeaders]

        if (extraHeaders) {
          serverHeaders = serverHeaders.concat(extraHeaders)
        }

        if (serverHeaders.length > 0) {
          await mainStack.setConfig('serverHeaders', {
            value: JSON.stringify(serverHeaders),
          })
        }

        await mainStack.refresh()
        const mainStackUpResult = await mainStack.up({ onOutput: console.info })
        const mainAllowedOrigins = JSON.stringify(
          mainStackUpResult.outputs.allowedOrigins.value
        )

        let serverAllowedOrigins: string = ''
        const serverConfig = await serverStack.getAllConfig()

        if ('sveltekit-aws-adapter-server:allowedOrigins' in serverConfig) {
          serverAllowedOrigins =
            serverConfig['sveltekit-aws-adapter-server:allowedOrigins'].value
        }

        if (serverAllowedOrigins !== mainAllowedOrigins) {
          // Call the server stack setting the allowed origins
          await serverStack.setConfig('allowedOrigins', {
            value: mainAllowedOrigins,
          })

          const serverStackUpUpdate = await serverStack.up({
            onOutput: console.info,
          })
        }

        // Fix TS_NODE_IGNORE when package is installed to node_modules
        // if (pulumiPath === `${__dirname}/pulumi`) {
        //   default_env['TS_NODE_IGNORE'] =
        //     '^(?!.*(sveltekit-adapter-aws-pulumi)).*'
        // }

        adapterProps.pulumiPaths = [serverPath, mainPath]
        adapterProps.stackName = stackName
        writeFileSync(
          join(artifactPath, '.adapterprops.json'),
          JSON.stringify(adapterProps)
        )

        builder.log.minor('Pulumi deployment done.')
      }
    },
  }
}
