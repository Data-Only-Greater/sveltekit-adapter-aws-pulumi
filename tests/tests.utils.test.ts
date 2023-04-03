describe('tests/utils.ts', () => {
  let utils: typeof import('./utils')

  beforeEach(async () => {
    vi.resetModules()
    utils = await import('./utils')
  })

  it.each([
    ['dsaGS-', false],
    ['af2-431--fdwfef', false],
    ['32546546*-fgdasg', false],
    ['grae0-5344-gafgar', true],
  ])('validName(%s)', async (test, expected) => {
    const result = utils.validName(test)
    expect(result).toBe(expected)
  })
})
