import * as path from 'path';

import { config, DotenvConfigOutput } from 'dotenv';
import { assign, keys, pick } from 'lodash';

export function getEnvironment(projectPath: string): DotenvConfigOutput {
  const dotenv = config({ path: path.join(projectPath, '.env') });
  const parsed = assign({}, dotenv.parsed, pick(process.env, keys(dotenv.parsed)));
  return { parsed: parsed } as DotenvConfigOutput;
}
