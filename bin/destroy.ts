import { spawnSync } from 'child_process';
import parseArgs from 'minimist';

import { AWSAdapterProps } from '../adapter';

let artifactPath = 'build';
const argv = parseArgs(process.argv.slice(2));
if (argv._.length) {
  artifactPath = argv._[0];
}

const adapterProps: AWSAdapterProps = await import(`${artifactPath}/.adapterprops.json`);

spawnSync('pulumi', ['destroy', '-f', '-s', adapterProps.stackName!, '-y'], {
  cwd: adapterProps.pulumiPath,
  stdio: [process.stdin, process.stdout, process.stderr],
  env: process.env,
});
