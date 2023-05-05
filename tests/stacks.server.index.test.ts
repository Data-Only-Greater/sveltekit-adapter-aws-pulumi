import * as fs from 'fs'
import * as path from 'path'

import * as pulumi from '@pulumi/pulumi'

import { MyMocks, getTempDir, promiseOf } from './utils'
import * as resources from '../stacks/server/resources'

vi.mock('../stacks/server/resources')

describe('stacks/server/index.ts', () => {
  let envOrig: string
  let mocks: MyMocks
  let infra: typeof import('../stacks/server')

  beforeEach(async () => {
    vi.resetModules()
    envOrig = JSON.stringify(process.env)
    mocks = new MyMocks()
    pulumi.runtime.setMocks(mocks)
  })

  afterEach(() => {
    process.env = JSON.parse(envOrig)
    vi.resetAllMocks()
  })

  it('main', async () => {
    const tmpDir = getTempDir()
    const envPath = path.join(tmpDir, '.env')
    const envContent = 'MOCK=\n'
    fs.writeFileSync(envPath, envContent)
    ;(resources.getLambdaRole as any).mockImplementation(() => {
      return 'mock'
    })

    const mockBuildLambda = resources.buildLambda as any
    mockBuildLambda.mockImplementation(() => {
      return {
        functionArn: pulumi.interpolate`arn`,
        functionUrl: pulumi.interpolate`https://www.example.com/`,
      }
    })

    // @ts-ignore
    pulumi.Config = vi.fn(() => {
      return {
        get: vi.fn((x) => {
          if (x === 'projectPath') {
            return tmpDir
          }
          if (x === 'allowedOrigins') {
            return '[example.com]'
          }
          if (x === 'memorySize') {
            return '256'
          }
          return ''
        }),
      }
    })

    infra = await import('../stacks/server')

    expect(resources.getLambdaRole).toHaveBeenCalledTimes(1)
    expect(resources.buildLambda).toHaveBeenCalledTimes(2)

    expect(mockBuildLambda.mock.calls[0][3]).toStrictEqual({ MOCK: '' })
    expect(mockBuildLambda.mock.calls[0][4]).toStrictEqual(256)
    expect(mockBuildLambda.mock.calls[1][3]).toStrictEqual({
      ALLOWED_ORIGINS: '[example.com]',
    })

    const serverArn = await promiseOf(infra.serverArn)
    const optionsArn = await promiseOf(infra.optionsArn)

    expect(serverArn).toMatch('arn')
    expect(optionsArn).toMatch('arn')

    const serverDomain = await promiseOf(infra.serverDomain)
    const optionsDomain = await promiseOf(infra.optionsDomain)

    expect(serverDomain).toMatch('www.example.com')
    expect(optionsDomain).toMatch('www.example.com')

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('main (defaults)', async () => {
    const tmpDir = getTempDir()
    const envPath = path.join(tmpDir, '.env')
    const envContent = 'MOCK=\n'
    fs.writeFileSync(envPath, envContent)
    ;(resources.getLambdaRole as any).mockImplementation(() => {
      return 'mock'
    })

    const mockBuildLambda = resources.buildLambda as any
    mockBuildLambda.mockImplementation(() => {
      return {
        functionArn: pulumi.interpolate`arn`,
        functionUrl: pulumi.interpolate`https://www.example.com/`,
      }
    })

    // @ts-ignore
    pulumi.Config = vi.fn(() => {
      return {
        get: vi.fn((x) => {
          if (x === 'projectPath') {
            return tmpDir
          }
          return ''
        }),
      }
    })

    infra = await import('../stacks/server')

    expect(mockBuildLambda.mock.calls[1][3]).toStrictEqual({})

    fs.rmSync(tmpDir, { recursive: true })
  })
})
