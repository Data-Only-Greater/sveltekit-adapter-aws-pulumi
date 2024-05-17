import * as pulumi from '@pulumi/pulumi'

import { MyMocks, promiseOf } from './utils.js'
import * as resources from '../stacks/main/resources.js'

vi.mock('../stacks/main/resources')

describe('stacks/main/index.ts', () => {
  let envOrig: string
  let mocks: MyMocks
  let infra: typeof import('../stacks/main/index.js')

  beforeEach(async () => {
    vi.resetModules()
    envOrig = JSON.stringify(process.env)
    mocks = new MyMocks()
    pulumi.runtime.setMocks(mocks)
  })

  afterEach(() => {
    process.env = JSON.parse(envOrig)
  })

  it('Without FQDN', async () => {
    let applyMethod: any
    ;(resources.buildRouter as any).mockImplementation(() => {
      return 'mock'
    })
    ;(resources.buildCDN as any).mockImplementation(() => {
      return {
        domainName: 'example.com',
        id: { apply: (x: any) => (applyMethod = x) },
      }
    })
    // @ts-ignore
    pulumi.Config = vi.fn(() => {
      return {
        get: vi.fn((x) => {
          return ''
        }),
        require: vi.fn((x) => {
          console.log(x)
          if (x === 'serverHeaders') {
            return '{"mock": "mock"}'
          }
          return ''
        }),
      }
    })

    infra = await import('../stacks/main/index.js')

    expect(resources.getLambdaRole).toHaveBeenCalledTimes(1)
    expect(resources.validateCertificate).toHaveBeenCalledTimes(0)
    expect(resources.buildStatic).toHaveBeenCalledTimes(1)
    expect(resources.buildCDN).toHaveBeenCalledTimes(1)
    expect(resources.createAliasRecord).toHaveBeenCalledTimes(0)
    expect(applyMethod).toBeTypeOf('function')

    const allowedOrigin = await promiseOf(
      infra.allowedOrigins[0] as pulumi.Output<string>,
    )
    const appUrl = await promiseOf(infra.appUrl as pulumi.Output<string>)
    expect(allowedOrigin).toMatch('https://example.com')
    expect(appUrl).toMatch('https://example.com')
  })

  it('With FQDN', async () => {
    const fqdn = 'mock.application.net'
    ;(resources.buildRouter as any).mockImplementation(() => {
      return 'mock'
    })
    ;(resources.buildCDN as any).mockImplementation(() => {
      return {
        domainName: 'example.com',
        id: { apply: (x: any) => null },
      }
    })
    // @ts-ignore
    pulumi.Config = vi.fn(() => {
      return {
        get: vi.fn((x) => {
          if (x === 'FQDN') {
            return fqdn
          }
          return ''
        }),
        require: vi.fn((x) => {
          if (x === 'serverHeaders') {
            return '{"mock": "mock"}'
          }
          return ''
        }),
      }
    })

    infra = await import('../stacks/main/index.js')

    expect(resources.validateCertificate).toHaveBeenCalledTimes(1)
    expect(resources.createAliasRecord).toHaveBeenCalledTimes(1)

    const distOrigin = await promiseOf(
      infra.allowedOrigins[0] as pulumi.Output<string>,
    )
    const fqdnOrigin = infra.allowedOrigins[1]

    expect(distOrigin).toMatch('https://example.com')
    expect(fqdnOrigin).toMatch(`https://${fqdn}`)
    expect(infra.appUrl).toMatch(`https://${fqdn}`)
  })
})
