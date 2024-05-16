import * as fs from 'fs'
import * as path from 'path'
import * as child_process from 'child_process'

import { getTempDir } from './utils.js'

vi.mock('child_process', async (importOriginal) => {
  const mod: any = await importOriginal()
  return {
    ...mod,
    spawnSync: vi.fn(),
  }
})

describe('bin/destroy.ts', () => {
  let destroy: typeof import('../bin/destroy.js')

  beforeEach(async () => {
    vi.resetModules()
    destroy = await import('../bin/destroy.js')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetAllMocks()
  })

  it('main (artifactPath)', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 0 })
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

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(2)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: expectedPulumiPaths[0],
        }),
      ]),
    )
  })

  it('main (-s --default-projects)', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 0 })

    const expectedStackName = 'mock'
    const argv = [
      'node',
      'destroy',
      '-s',
      expectedStackName,
      '--default-projects',
    ]
    await destroy.main(argv)

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(2)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: path.resolve(process.cwd(), 'stacks', 'server'),
        }),
      ]),
    )
  })

  it('main (-s --default-projects -f)', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 0 })

    const expectedStackName = 'mock'
    const argv = [
      'node',
      'destroy',
      '-s',
      expectedStackName,
      '--default-projects',
      '-f',
    ]
    await destroy.main(argv)

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(4)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['cancel', '-s', expectedStackName, '-y'],
        expect.objectContaining({
          cwd: path.resolve(process.cwd(), 'stacks', 'server'),
        }),
      ]),
    )
  })

  it('main (-s --default-projects --force)', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 0 })

    const expectedStackName = 'mock'
    const argv = [
      'node',
      'destroy',
      '-s',
      expectedStackName,
      '--default-projects',
      '--force',
    ]
    await destroy.main(argv)

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(4)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['cancel', '-s', expectedStackName, '-y'],
        expect.objectContaining({
          cwd: path.resolve(process.cwd(), 'stacks', 'server'),
        }),
      ]),
    )
  })

  it('main (-s --default-projects) retries', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 1 })

    const expectedStackName = 'mock'
    const argv = [
      'node',
      'destroy',
      '-s',
      expectedStackName,
      '--default-projects',
    ]
    await destroy.main(argv)

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(8)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: path.resolve(process.cwd(), 'stacks', 'server'),
        }),
      ]),
    )
  })

  it('main (no args)', async () => {
    // @ts-ignore
    child_process.spawnSync = vi.fn().mockReturnValue({ status: 0 })
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

    let spawnSyncMock = <any>child_process.spawnSync
    const args = spawnSyncMock.mock.calls[0]

    expect(child_process.spawnSync).toHaveBeenCalledTimes(2)
    expect(args).toEqual(
      expect.arrayContaining([
        'pulumi',
        ['destroy', '-f', '-s', expectedStackName, '-y', '--refresh'],
        expect.objectContaining({
          cwd: expectedPulumiPaths[0],
        }),
      ]),
    )
  })

  it('main (--default-projects)', async () => {
    const spy = vi.spyOn(process, 'cwd')
    const logSpy = vi.spyOn(global.console, 'log')

    const tmpDir = getTempDir()
    spy.mockReturnValue(tmpDir)

    const argv = ['node', 'destroy', '--default-projects']
    await destroy.main(argv)

    expect(logSpy.mock.calls).not.toContainEqual([
      'Paths to pulumi projects could not be determined',
    ])
    expect(logSpy.mock.calls).toContainEqual([
      'Stack name could not be determined',
    ])
    expect(logSpy.mock.calls).toContainEqual(['Aborting'])

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('main (-s)', async () => {
    const spy = vi.spyOn(process, 'cwd')
    const logSpy = vi.spyOn(global.console, 'log')

    const tmpDir = getTempDir()
    spy.mockReturnValue(tmpDir)

    const argv = ['node', 'destroy', '-s', 'mock']
    await destroy.main(argv)

    expect(logSpy.mock.calls).toContainEqual([
      'Paths to pulumi projects could not be determined',
    ])
    expect(logSpy.mock.calls).not.toContainEqual([
      'Stack name could not be determined',
    ])
    expect(logSpy.mock.calls).toContainEqual(['Aborting'])

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('main (no args missing build directory)', async () => {
    const spy = vi.spyOn(process, 'cwd')
    const logSpy = vi.spyOn(global.console, 'log')

    const tmpDir = getTempDir()
    spy.mockReturnValue(tmpDir)

    const argv = ['node', 'destroy']
    await destroy.main(argv)

    expect(logSpy.mock.calls).toContainEqual([
      'Paths to pulumi projects could not be determined',
    ])
    expect(logSpy.mock.calls).toContainEqual([
      'Stack name could not be determined',
    ])
    expect(logSpy.mock.calls).toContainEqual(['Aborting'])

    fs.rmSync(tmpDir, { recursive: true })
  })
})
