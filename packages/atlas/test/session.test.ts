import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {assert} from '../../../test/assert.js';
import {extractWorkspace} from '../src/extract-workspace.js';
import {createAtlasSession, parseCommand} from '../src/session.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('the session derives impact, upstream, and a stable layout', async () => {
  const snapshot = await extractWorkspace(repoRoot);
  const session = createAtlasSession({
    root: snapshot.root,
    snapshot,
    viewport: {width: 1400, height: 800},
  });

  try {
    const structure = session.graph.value;
    assert(structure !== null, 'the graph is built from the snapshot');
    const again = session.graph.value;
    assert(again === structure, 'the graph computed is cached');

    session.runtime.batch(() => {
      session.selectedId.value = 'graphora-data-structures';
      session.lens.value = 'impact';
    });

    assert(session.graph.value === structure, 'selection does not rebuild the graph');
    const impact = new Set(session.downstream.value);
    assert(impact.has('graphora-graph'), 'impact includes graph');
    assert(impact.has('graphora-reactive'), 'impact includes reactive');
    assert(impact.has('graphora-integrations'), 'impact includes integrations');

    const lit = new Set(session.emphasis.value.nodes);
    assert(lit.has('graphora-graph'), 'the impact lens lights graph');
    assert(lit.has('graphora-reactive'), 'the impact lens lights reactive');
    assert(lit.has('graphora-integrations'), 'the impact lens lights integrations');

    session.runtime.batch(() => {
      session.selectedId.value = 'graphora-integrations';
      session.lens.value = 'upstream';
    });

    const ancestors = new Set(session.upstream.value);
    assert(ancestors.has('graphora-reactive'), 'integrations stands on reactive');
    assert(ancestors.has('graphora-data-structures'), 'integrations stands on data-structures');
    assert(!ancestors.has('graphora'), 'graphora is not upstream of integrations');

    session.setLens('cycles');
    assert(session.order.value.kind === 'order', 'this workspace has a build order');
    assert(session.emphasis.value.nodes.length === 0, 'the cycles lens lights nothing here');
    assert(
      session.components.value.length === snapshot.nodes.length,
      'each package is its own component',
    );

    const layout = session.layout.value;
    session.setQuery('graph');
    assert(session.layout.value === layout, 'a filter does not move the layout');
    session.setViewport({width: 1000, height: 700});
    assert(session.layout.value !== layout, 'viewport size recomputes the layout');

    assert(
      parseCommand('graphora-graph impact', ['graphora-graph']).packageId === 'graphora-graph',
      'command reads a package',
    );
    assert(
      parseCommand('graphora-graph impact', ['graphora-graph']).lens === 'impact',
      'command reads a lens',
    );
  } finally {
    session.dispose();
  }
});
