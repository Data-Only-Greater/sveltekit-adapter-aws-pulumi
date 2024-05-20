export class NameRegister {
  private static singleton: NameRegister
  private _names: string[] = []
  private constructor() {}

  public static getInstance(): NameRegister {
    if (!NameRegister.singleton) {
      NameRegister.singleton = new NameRegister()
    }
    return NameRegister.singleton
  }

  public registerName(name: string): string {
    if (this._names.includes(name)) {
      throw Error(`Resource name "${name}" already used`)
    }
    this._names.push(name)
    return name
  }

  public getRegisteredNames(): string[] {
    return this._names
  }
}
