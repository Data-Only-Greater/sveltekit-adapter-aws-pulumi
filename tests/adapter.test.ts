
import * as fs from 'fs';
import * as path from 'path';
import prepAdapter from 'sveltekit-adapter-aws-base'

import { getTempDir } from './utils';

vi.mock('child_process')
vi.mock('sveltekit-adapter-aws-base')

describe('adapter.ts', () => {
    let adapter: typeof import('../adapter');
  
    beforeEach(async () => {
      vi.resetModules();
      adapter = await import('../adapter');
    });
  
    it('Store adapter props', async () => {
        
      (prepAdapter as any).mockImplementation(() => {
        return {
          server_directory: "mock", 
          static_directory: "mock", 
          prerendered_directory: "mock",
          routes: [ "mock" ]}
      });
      
      const builder = {
        log: {
          minor: vi.fn((x) => console.log(x)),
        },
        writeClient: vi.fn(() => {
          return ['a', 'b', 'c'];
        }),
        writePrerendered: vi.fn(() => {
          return ['a', 'b', 'c'];
        }),
        writeServer: vi.fn(async (x) => {
          await fs.promises.appendFile(path.join(x, 'index.js'), '');
        }),
      };
  
      const tmpDir = getTempDir();
      
      const awsAdapter = adapter.adapter({
        artifactPath: tmpDir,
        autoDeploy: true,
      });
      await awsAdapter.adapt(builder);
  
      const propsPath = path.join(tmpDir, '.adapterprops.json');
      expect(fs.existsSync(propsPath)).toBe(true);
  
      fs.rmSync(tmpDir, { recursive: true });
    });
    
});
