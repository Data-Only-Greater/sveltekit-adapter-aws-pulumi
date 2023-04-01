import { writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import * as url from 'url'

import prepAdapter from 'sveltekit-adapter-aws-base'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

export interface AWSAdapterProps {
  artifactPath?: string
  autoDeploy?: boolean
  pulumiPath?: string
  stackName?: string
  serverHeaders?: string[]
  staticHeaders?: string[]
  esbuildOptions?: any
  FQDN?: string
  MEMORY_SIZE?: number
  zoneName?: string
  env?: { [key: string]: string }
}

export function adapter({
  artifactPath = 'build',
  autoDeploy = false,
  pulumiPath = `${__dirname}/pulumi`,
  stackName = 'sveltekit-adapter-aws',
  serverHeaders = [
    'Accept',
    'Accept-Charset',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'Accept-Datetime',
    'Accept-Language',
    'Origin',
    'Referer',
  ],
  staticHeaders = ['User-Agent', 'Referer'],
  esbuildOptions = {},
  FQDN,
  MEMORY_SIZE,
  zoneName = '',
  env = {},
}: AWSAdapterProps = {}) {
  /** @type {import('@sveltejs/kit').Adapter} */
  return {
    name: 'adapter-aws-pulumi',
    async adapt(builder: any) {
      const {
        server_directory,
        static_directory,
        prerendered_directory,
        routes,
      } = await prepAdapter(builder, artifactPath, esbuildOptions)

      if (autoDeploy) {
        let adapterProps: AWSAdapterProps = {}

        builder.log.minor('Deploy using Pulumi.')

        const default_env: any = {
          PROJECT_PATH: join(process.cwd(), '.env'),
          SERVER_PATH: join(process.cwd(), server_directory),
          STATIC_PATH: join(process.cwd(), static_directory),
          PRERENDERED_PATH: join(process.cwd(), prerendered_directory),
          ROUTES: routes,
          SERVER_HEADERS: serverHeaders,
          STATIC_HEADERS: staticHeaders,
          FQDN,
          MEMORY_SIZE,
          ZONE_NAME: zoneName,
        }

        // Fix TS_NODE_IGNORE when package is installed to node_modules
        if (pulumiPath === `${__dirname}/pulumi`) {
          default_env['TS_NODE_IGNORE'] =
            '^(?!.*(sveltekit-adapter-aws-pulumi)).*'
        }

        spawnSync('pulumi', ['up', '-s', stackName, '-f', '-y'], {
          cwd: pulumiPath,
          stdio: [process.stdin, process.stdout, process.stderr],
          env: Object.assign(default_env, process.env, env),
        })

        adapterProps.pulumiPath = pulumiPath
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
