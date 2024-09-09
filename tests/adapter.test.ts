import * as fs from 'fs'
import * as path from 'path'

import {
  buildServer,
  buildOptions,
  buildRouter,
} from 'sveltekit-adapter-aws-base'

import { getTempDir } from './utils.js'

vi.mock('sveltekit-adapter-aws-base')
vi.mock('@pulumi/pulumi/automation/index.js', () => {
  const Stack = {
    getAllConfig: vi.fn(() => {
      return {}
    }),
    refresh: vi.fn(),
    removeConfig: vi.fn(),
    setConfig: vi.fn(),
    setAllConfig: vi.fn(),
    up: vi.fn(() => {
      return {
        outputs: {
          serverArn: {
            value: 'mock',
          },
          optionsArn: {
            value: 'mock',
          },
          serverDomain: {
            value: 'mock',
          },
          optionsDomain: {
            value: 'mock',
          },
          allowedOrigins: {
            value: ['mock'],
          },
        },
      }
    }),
  }
  const LocalWorkspace = {
    createOrSelectStack: vi.fn(() => Stack),
  }

  return {
    LocalWorkspace,
  }
})

describe('adapter.ts', () => {
  let adapter: typeof import('../adapter.js')

  beforeEach(async () => {
    vi.resetModules()
    adapter = await import('../adapter.js')
  })

  it('Store adapter props', async () => {
    ;(buildServer as any).mockImplementation(() => {
      return {
        server_directory: 'mock',
        static_directory: 'mock',
        prerendered_directory: 'mock',
      }
    })
    ;(buildOptions as any).mockImplementation(() => {
      return 'mock'
    })
    ;(buildRouter as any).mockImplementation(() => {
      return 'mock'
    })

    const builder = {
      log: {
        minor: vi.fn((x) => console.log(x)),
      },
      writeClient: vi.fn(() => {
        return ['a', 'b', 'c']
      }),
      writePrerendered: vi.fn(() => {
        return ['a', 'b', 'c']
      }),
      writeServer: vi.fn(async (x) => {
        await fs.promises.appendFile(path.join(x, 'index.js'), '')
      }),
    }

    const tmpDir = getTempDir()

    const awsAdapter = adapter.adapter({
      artifactPath: tmpDir,
      autoDeploy: true,
      stackName: 'mock',
    })
    await awsAdapter.adapt(builder)

    const propsPath = path.join(tmpDir, '.adapterprops.json')
    expect(fs.existsSync(propsPath)).toBe(true)

    fs.rmSync(tmpDir, { recursive: true })
  })
})
