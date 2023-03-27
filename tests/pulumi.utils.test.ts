import * as fs from 'fs';
import * as path from 'path';

import { getTempDir } from './utils';

describe('pulumi/utils.ts', () => {
  let envOrig: string;
  let utils: typeof import('../pulumi/utils');

  beforeEach(async () => {
    vi.resetModules();
    envOrig = JSON.stringify(process.env);
    utils = await import('../pulumi/utils');
  });

  afterEach(() => {
    process.env = JSON.parse(envOrig);
  });

  it('getEnvironment (without process.env)', () => {
    const tmpDir = getTempDir();
    const data = 'MOCK=mymock';

    console.log(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '.env'), data);

    const environment = utils.getEnvironment(tmpDir);
    expect(environment.parsed).toEqual({ MOCK: 'mymock' });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getEnvironment (with process.env)', () => {
    process.env['MOCK'] = 'anothermock';
    const tmpDir = getTempDir();
    const data = 'MOCK=mymock';

    console.log(tmpDir);
    fs.writeFileSync(path.join(tmpDir, '.env'), data);

    const environment = utils.getEnvironment(tmpDir);
    expect(environment.parsed).toEqual({ MOCK: 'anothermock' });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
