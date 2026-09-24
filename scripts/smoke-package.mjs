import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'graphora-smoke-'));

function run(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      [`Command failed: ${command} ${arguments_.join(' ')}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return result.stdout;
}

try {
  const packOutput = run(
    npm,
    ['pack', '--workspace', 'graphora', '--pack-destination', temporaryDirectory, '--json'],
    root,
  );
  const [packed] = JSON.parse(packOutput);

  if (packed === undefined || typeof packed.filename !== 'string') {
    throw new Error('npm pack did not report a tarball filename.');
  }

  const tarball = join(temporaryDirectory, packed.filename);
  await writeFile(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({private: true, type: 'module'}, undefined, 2),
  );
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], temporaryDirectory);

  await writeFile(
    join(temporaryDirectory, 'consumer.mjs'),
    `
import {DirectedGraph, Node, ReactiveComputed, ReactiveRuntime, ReactiveValue} from 'graphora';
import {hasPath} from 'graphora/graph';
import {ManualEffectScheduler} from 'graphora/reactive';
import {ReactiveNode} from 'graphora/advanced';

const graph = new DirectedGraph();
graph.addNode(new Node('a'));
graph.addNode(new Node('b'));
graph.addEdge('a', 'b');

const runtime = new ReactiveRuntime();
const source = new ReactiveValue(runtime, 'source', 2);
const doubled = new ReactiveComputed(runtime, 'doubled', () => source.value * 2);

if (!hasPath(graph, 'a', 'b') || doubled.value !== 4) {
  throw new Error('Packed public API smoke test failed.');
}

if (!(new ManualEffectScheduler()) || !(new ReactiveNode('advanced'))) {
  throw new Error('Packed subpath smoke test failed.');
}

const {createExternalStore} = await import('graphora/store');
const {createInspectorTools, toMcpTools} = await import('graphora/inspector');
const {createDevtoolsBridge} = await import('graphora/devtools');
const {createOpenTelemetryPlugin} = await import('graphora/opentelemetry');

const store = createExternalStore(runtime, doubled);
const tools = createInspectorTools(runtime);
const messages = [];
runtime.use(createDevtoolsBridge({runtimeId: 'smoke', send: (message) => messages.push(message)}));
runtime.use(createOpenTelemetryPlugin({tracer: {startSpan: () => ({setAttribute() {}, addEvent() {}, setStatus() {}, end() {}})}}));

if (store.getSnapshot() !== 4 || toMcpTools(tools).length !== 6 || messages[0]?.type !== 'hello') {
  throw new Error('Packed integration subpath smoke test failed.');
}
`,
  );
  run(process.execPath, ['consumer.mjs'], temporaryDirectory);

  await writeFile(
    join(temporaryDirectory, 'consumer.ts'),
    `
import {DirectedGraph, Node, ReactiveRuntime, ReactiveValue} from 'graphora';
import type {ReactiveRuntimeInspection} from 'graphora/reactive';
import type {ReactiveNodeKind} from 'graphora/advanced';
import {createExternalStore, type ReactiveExternalStore} from 'graphora/store';
import type {McpToolResult} from 'graphora/inspector';
import type {DevtoolsOutgoingMessage} from 'graphora/devtools';
import type {OpenTelemetrySpanLike} from 'graphora/opentelemetry';

const graph = new DirectedGraph<{name: string}>();
graph.addNode(new Node('user', {name: 'Ada'}));

const runtime = new ReactiveRuntime();
const value = new ReactiveValue(runtime, 'value', 1);
const inspection: ReactiveRuntimeInspection = runtime.inspect();
const kind: ReactiveNodeKind = value.node.kind;
const store: ReactiveExternalStore<number> = createExternalStore(runtime, value);
const result: McpToolResult | undefined = undefined;
const message: DevtoolsOutgoingMessage | undefined = undefined;
const span: OpenTelemetrySpanLike | undefined = undefined;

void graph;
void inspection;
void kind;
void store;
void result;
void message;
void span;
`,
  );
  await writeFile(
    join(temporaryDirectory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        include: ['consumer.ts'],
      },
      undefined,
      2,
    ),
  );
  run(
    process.execPath,
    [join(root, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    temporaryDirectory,
  );

  console.log(
    `Packed graphora smoke test passed (${packed.size} bytes packed, ${packed.unpackedSize} bytes unpacked).`,
  );
} finally {
  await rm(temporaryDirectory, {recursive: true, force: true});
}
