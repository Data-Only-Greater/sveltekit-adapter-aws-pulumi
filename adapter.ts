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
  serverStreaming?: boolean
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
  memorySize = 128,
  pulumiPaths = [],
  region = 'us-east-2',
  serverStreaming = false,
  stackName = 'dev',
}: AWSAdapterProps = {}) {
  /** @type {import('@sveltejs/kit').Adapter} */
  return {
    name: 'adapter-aws-pulumi',
    async adapt(builder: any) {
      const { server_directory, static_directory, prerendered_directory } =
        await buildServer(
          builder,
          artifactPath,
          esbuildOptions,
          serverStreaming
        )

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

        await serverStack.setAllConfig({
          'aws:region': { value: region },
          projectPath: { value: process.cwd() },
          serverPath: { value: server_directory },
          optionsPath: { value: options_directory },
          memorySize: { value: String(memorySize) },
        })

        if (serverStreaming) {
          await serverStack.setConfig('serverInvokeMode', {
            value: 'RESPONSE_STREAM',
          })
        } else {
          await serverStack.removeConfig('serverInvokeMode')
        }

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

        await mainStack.setAllConfig({
          'aws:region': { value: region },
          edgePath: { value: edge_directory },
          staticPath: { value: static_directory },
          prerenderedPath: { value: prerendered_directory },
          serverArn: { value: serverStackUpResult.outputs.serverArn.value },
          optionsArn: { value: serverStackUpResult.outputs.optionsArn.value },
        })

        if (FQDN) {
          await mainStack.setConfig('FQDN', { value: FQDN })
        } else {
          await mainStack.removeConfig('FQDN')
        }

        let serverHeaders: string[] = [...defaultHeaders]

        if (extraHeaders) {
          serverHeaders = serverHeaders.concat(extraHeaders)
        }

        if (serverHeaders.length > 0) {
          await mainStack.setConfig('serverHeaders', {
            value: JSON.stringify(serverHeaders),
          })
        } else {
          await mainStack.removeConfig('serverHeaders')
        }

        await mainStack.refresh()
        const mainStackUpResult = await mainStack.up({ onOutput: console.info })
        const mainAllowedOrigins = JSON.stringify(
          mainStackUpResult.outputs.allowedOrigins.value
        )

        // Call the server stack setting the allowed origins
        await serverStack.setConfig('allowedOrigins', {
          value: mainAllowedOrigins,
        })

        await serverStack.up({
          onOutput: console.info,
        })

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
