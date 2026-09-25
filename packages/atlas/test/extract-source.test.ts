import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {assert} from '../../../test/assert.js';
import {extractProject} from '../src/extract-project.js';
import {IMPORTS} from '../src/model.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('a single project is drawn as its src structure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-source-'));

  try {
    await mkdir(join(root, 'src/agents'), {recursive: true});
    await mkdir(join(root, 'src/communication'), {recursive: true});
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({name: 'multi-agent', version: '1.0.0'}),
    );
    await writeFile(join(root, 'src/agents/Agent.ts'), 'export class Agent {}\n');
    await writeFile(
      join(root, 'src/agents/CodingAgent.ts'),
      "import {Agent} from './Agent.js';\nimport {handoff} from '../communication/handoffs.js';\nexport class CodingAgent extends Agent {}\n",
    );
    await writeFile(join(root, 'src/communication/handoffs.ts'), 'export function handoff() {}\n');
    await writeFile(
      join(root, 'src/index.ts'),
      "import {CodingAgent} from './agents/CodingAgent.js';\nexport {CodingAgent};\n",
    );
    await writeFile(join(root, 'src/config.ts'), 'export const name = "multi-agent";\n');

    const snapshot = await extractProject(root);
    const ids = new Set(snapshot.nodes.map((node) => node.id));
    const agents = snapshot.nodes.find((node) => node.id === 'agents');

    assert(snapshot.kind === 'source', 'a single project uses the source map');
    assert(ids.has('agents') && ids.has('communication'), 'folders are structure nodes');
    assert(ids.has('index.ts') && ids.has('config.ts'), 'loose source files are nodes');
    assert(!ids.has('multi-agent'), 'the package is not the picture');
    const agentFiles = new Set(agents?.files ?? []);
    assert(
      agentFiles.has('Agent.ts') && agentFiles.has('CodingAgent.ts'),
      'the folder tooltip lists its files',
    );
    assert(agents?.path === 'src/agents', 'the node records the source path');

    const edge = (from: string, to: string) =>
      snapshot.edges.some(
        (item) => item.relation === IMPORTS && item.from === from && item.to === to,
      );

    assert(edge('communication', 'agents'), 'agents stands on communication');
    assert(edge('agents', 'index.ts'), 'index stands on agents');
    assert(!edge('config.ts', 'index.ts'), 'config is not imported');
    assert(
      !snapshot.edges.some((item) => item.from === 'agents' && item.to === 'agents'),
      'imports inside a folder are not edges',
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('a workspace of several packages stays a package map', async () => {
  const snapshot = await extractProject(repoRoot);
  const ids = new Set(snapshot.nodes.map((node) => node.id));

  assert(snapshot.kind === 'workspace', 'this repository stays a workspace map');
  assert(ids.has('graphora-graph'), 'packages remain the nodes');
  assert(!ids.has('main.tsx'), 'source files are not nodes in a workspace');
});
