describe('stacks/utils.ts', () => {
  let envOrig: string
  let utils: typeof import('../stacks/utils.js')

  beforeEach(async () => {
    vi.resetModules()
    envOrig = JSON.stringify(process.env)
    utils = await import('../stacks/utils.js')
  })

  afterEach(() => {
    process.env = JSON.parse(envOrig)
  })

  it('NameRegister.registerName', () => {
    const nameRegister = utils.NameRegister.getInstance()
    const expected = 'a'
    const result = nameRegister.registerName(expected)
    expect(result).toMatch(expected)
  })

  it('NameRegister.registerName (fail on repeat)', () => {
    const nameRegister = utils.NameRegister.getInstance()
    nameRegister.registerName('a')
    expect(() => nameRegister.registerName('a')).toThrowError('"a"')
  })

  it('NameRegister.registerName (two instance fail on repeat)', () => {
    const nameRegisterOne = utils.NameRegister.getInstance()
    nameRegisterOne.registerName('a')
    const nameRegisterTwo = utils.NameRegister.getInstance()
    expect(() => nameRegisterTwo.registerName('a')).toThrowError('"a"')
  })

  it('NameRegister.getRegisteredNames (two instance)', () => {
    const nameRegisterOne = utils.NameRegister.getInstance()
    nameRegisterOne.registerName('a')
    const nameRegisterTwo = utils.NameRegister.getInstance()
    nameRegisterTwo.registerName('b')
    expect(nameRegisterTwo.getRegisteredNames()).toEqual(['a', 'b'])
  })
})
