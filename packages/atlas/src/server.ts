/**
 * Dev server for graphora/atlas.
 *
 * The default root is this repository. The page receives one snapshot; the
 * browser session is the only picture state after that.
 */

import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {access, readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';
import {extractWorkspace} from './extract-workspace.js';
import type {AtlasBoot, AtlasSnapshot} from './model.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const uiDir = join(here, 'ui');

async function main(): Promise<void> {
  const root = resolve(readOption('--root') ?? repoRoot);
  const port = Number(readOption('--port') ?? process.env.PORT ?? 4318);
  const graphoraEntry = join(repoRoot, 'packages/graphora/dist/graphora/index.js');

  try {
    await access(graphoraEntry);
  } catch {
    console.error('Build graphora before starting atlas: npm run build');
    process.exit(1);
  }

  const script = await bundleUi();
  const stylesheet = await readFile(join(uiDir, 'atlas.css'), 'utf8');

  const server = createServer((request, response) => {
    void handle(request, response, {root, script, stylesheet});
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`graphora/atlas  http://127.0.0.1:${port}`);
    console.log(root);
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  assets: {readonly root: string; readonly script: string; readonly stylesheet: string},
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  try {
    if (url.pathname === '/atlas.css') {
      send(response, 200, 'text/css; charset=utf-8', assets.stylesheet);
      return;
    }

    if (url.pathname === '/app.js') {
      send(response, 200, 'text/javascript; charset=utf-8', assets.script);
      return;
    }

    if (url.pathname === '/api/snapshot') {
      const snapshot = await extractWorkspace(assets.root);
      send(response, 200, 'application/json; charset=utf-8', JSON.stringify(snapshot));
      return;
    }

    if (url.pathname !== '/') {
      send(response, 404, 'text/plain; charset=utf-8', 'Not found');
      return;
    }

    const boot = await bootPayload(assets.root);
    send(response, 200, 'text/html; charset=utf-8', html(boot));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    send(response, 500, 'text/plain; charset=utf-8', message);
  }
}

async function bootPayload(root: string): Promise<AtlasBoot> {
  try {
    const snapshot: AtlasSnapshot = await extractWorkspace(root);
    return {root: snapshot.root, snapshot, error: null};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {root, snapshot: null, error: message};
  }
}

function html(boot: AtlasBoot): string {
  const payload = JSON.stringify(boot).replaceAll('<', '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>graphora/atlas</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520&family=Outfit:wght@340;420;520&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/atlas.css" />
  </head>
  <body>
    <div id="root"></div>
    <script id="atlas-boot" type="application/json">${payload}</script>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
}

async function bundleUi(): Promise<string> {
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: [join(uiDir, 'main.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    write: false,
    sourcemap: 'inline',
    define: {'process.env.NODE_ENV': '"development"'},
    logLevel: 'silent',
  });

  const file = result.outputFiles?.[0];
  if (!file) throw new Error('The atlas UI bundle was empty.');
  return file.text;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  response.end(body);
}

await main();
