import {test} from 'node:test';
import {assert} from '../../../test/assert.js';
import {atlasEdgeId, type AtlasSnapshot} from '../src/model.js';
import {
  buildPackageGraph,
  components,
  cycles,
  degrees,
  downstream,
  order,
  path,
  relationOf,
  upstream,
} from '../src/structural.js';

function snapshot(ids: string[], edges: Array<[string, string]>): AtlasSnapshot {
  return {
    root: '/fixture',
    extractedAt: '2026-09-25T00:00:00.000Z',
    nodes: ids.map((id) => ({
      id,
      version: '1.0.0',
      private: true,
      path: id,
      description: '',
    })),
    edges: edges.map(([from, to]) => ({
      id: atlasEdgeId('workspace-depends', from, to),
      from,
      to,
      relation: 'workspace-depends',
    })),
  };
}

test('queries follow edges from what must exist to what comes after', () => {
  const structure = buildPackageGraph(
    snapshot(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['a', 'c'],
        ['b', 'd'],
      ],
    ),
  );

  const result = order(structure);

  assert(result.kind === 'order', 'a dag has a build order');
  if (result.kind !== 'order') return;

  assert(result.ids[0] === 'a', 'rank 0 is the package with no incoming edge');
  assert(result.ids.at(-1) === 'd', 'the sink is last');
  assert(downstream(structure, 'a').sort().join(',') === 'b,c,d', 'descendants are downstream');
  assert(upstream(structure, 'd').sort().join(',') === 'a,b', 'ancestors are upstream');
  assert(downstream(structure, 'd').length === 0, 'a sink has nothing downstream');
  assert(path(structure, 'a', 'd')?.join(',') === 'a,b,d', 'path recovers one forward route');
  assert(path(structure, 'd', 'a') === null, 'there is no path against the edges');
  assert(degrees(structure, 'a').outDegree === 2, 'out-degree counts outgoing edges');
  assert(degrees(structure, 'd').inDegree === 1, 'in-degree counts incoming edges');
  assert(relationOf(structure, 'a', 'b') === 'workspace-depends', 'relation is keyed by edge id');
  assert(cycles(structure).length === 0, 'a dag has no cyclic components');
  assert(components(structure).length === 4, 'each dag node is its own component');
});

test('a cycle returns components instead of throwing', () => {
  const structure = buildPackageGraph(
    snapshot(
      ['a', 'b', 'c'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'b'],
      ],
    ),
  );
  const result = order(structure);

  assert(result.kind === 'cycle', 'topologicalSort throws and the order reports the cycle');
  if (result.kind !== 'cycle') return;

  const cyclic = result.components.find((component) => component.length > 1) ?? [];
  assert(cyclic.slice().sort().join(',') === 'b,c', 'the loop is one component');
  assert(downstream(structure, 'a').sort().join(',') === 'b,c', 'downstream still walks the loop');
});
