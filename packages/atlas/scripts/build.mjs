/**
 * Builds the published package: the library and CLI with tsc, and the map UI
 * as one prebuilt bundle so an install does not need esbuild or React.
 */

import {spawnSync} from 'node:child_process';
import {chmod, copyFile, mkdir, rm} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(packageDir, 'dist');

await rm(dist, {recursive: true, force: true});

const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.build.json'], {
  cwd: packageDir,
  stdio: 'inherit',
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

await mkdir(join(dist, 'ui'), {recursive: true});
await esbuild.build({
  absWorkingDir: packageDir,
  entryPoints: [join(packageDir, 'src/ui/main.tsx')],
  outfile: join(dist, 'ui/app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  define: {'process.env.NODE_ENV': '"production"'},
  logLevel: 'warning',
});
await copyFile(join(packageDir, 'src/ui/atlas.css'), join(dist, 'ui/atlas.css'));
await chmod(join(dist, 'server.js'), 0o755);
