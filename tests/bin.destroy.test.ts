import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

import { getTempDir } from './utils'

vi.mock('child_process', async (importOriginal) => {
  const mod: any = await importOriginal()
  return {
    ...mod,
    spawnSync: vi.fn(),
  }
})

describe('bin/destroy.ts', () => {
  let destroy: typeof import('../bin/destroy')

  beforeEach(async () => {
    vi.resetModules()
    destroy = await import('../bin/destroy')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  it('main (no args)', async () => {
    const tmpDir = getTempDir()
    const buildDir = path.join(tmpDir, 'build')
    fs.mkdirSync(buildDir)

    const propsPath = path.join(buildDir, '.adapterprops.json')

    const expectedStackName = 'mock'
    const expectedPulumiPaths = ['stacks/one', 'stacks/two']
    const json = JSON.stringify({
      stackName: expectedStackName,
      pulumiPaths: expectedPulumiPaths,
    })
    fs.writeFileSync(propsPath, json)

    const spy = vi.spyOn(process, 'cwd')
    spy.mockReturnValue(tmpDir)

    const argv = ['node', 'destroy']
    await destroy.main(argv)

    fs.rmSync(tmpDir, { recursive: true })

    let spawnSyncMock = <any>spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(spawnSync).toHaveBeenCalledTimes(2)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: expectedPulumiPaths[0],
        }),
      ])
    )
  })

  it('main (with build)', async () => {
    const tmpDir = getTempDir()
    const propsPath = path.join(tmpDir, '.adapterprops.json')

    const expectedStackName = 'mock'
    const expectedPulumiPaths = ['stacks/one', 'stacks/two']
    const json = JSON.stringify({
      stackName: expectedStackName,
      pulumiPaths: expectedPulumiPaths,
    })
    fs.writeFileSync(propsPath, json)

    const argv = ['node', 'destroy', tmpDir]
    await destroy.main(argv)

    fs.rmSync(tmpDir, { recursive: true })

    let spawnSyncMock = <any>spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(spawnSync).toHaveBeenCalledTimes(2)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: expectedPulumiPaths[0],
        }),
      ])
    )
  })

  it('main (no args or build)', async () => {
    const tmpDir = getTempDir()
    const spy = vi.spyOn(process, 'cwd')
    spy.mockReturnValue(tmpDir)

    const argv = ['node', 'destroy']
    await destroy.main(argv)

    fs.rmSync(tmpDir, { recursive: true })
  })
})
