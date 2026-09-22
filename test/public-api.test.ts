/**
 * Verifies the public package surface.
 *
 * These tests import from published entry points rather than internal files
 * so accidental export changes are caught as compatibility breaks.
 */

import * as graphApi from '../packages/graph/index.js';
import * as reactiveApi from '../packages/reactive/index.js';
import * as publicApi from '../packages/graph-engine/index.js';
import * as advancedApi from '../packages/graph-engine/advanced.js';
import {
  DirectedGraph,
  Node,
  ReactiveRuntime,
  ReactiveValue,
  stronglyConnectedComponents,
} from '../packages/graph-engine/index.js';
import type {ReactiveNodeKind, ReactiveNodeState} from '../packages/graph-engine/advanced.js';
import {assert} from './assert.js';

/**
 * Public types are imported so removing a type-only export fails typecheck.
 */
import type {
  ReactiveEffectScheduleHandle,
  ReactiveEffectScheduler,
  ReactiveGraphMetrics,
  ReactiveGraphSnapshot,
  ReactiveGraphSnapshotDiff,
  ReactiveGraphSnapshotEdge,
  ReactiveGraphSnapshotNode,
  ReactiveGraphSnapshotNodeChange,
  ReactiveNodeInspection,
  ReactiveRuntimeInspection,
  ReactiveRuntimeState,
} from '../packages/graph-engine/index.js';

/**
 * Runtime values exported by the graph public entry point.
 */
const GRAPH_RUNTIME_EXPORTS = [
  'DirectedGraph',
  'GraphEdge',
  'Node',
  'breadthFirstSearch',
  'depthFirstSearch',
  'getAncestors',
  'getDescendants',
  'getReachableNodes',
  'hasCycle',
  'hasPath',
  'stronglyConnectedComponents',
  'topologicalSort',
] as const;

/**
 * Runtime values exported by the reactive public entry point.
 */
const REACTIVE_RUNTIME_EXPORTS = [
  'ManualEffectScheduler',
  'ReactiveComputed',
  'ReactiveEffect',
  'ReactiveRuntime',
  'ReactiveScheduler',
  'ReactiveValue',
  'diffReactiveGraphSnapshots',
] as const;

const ADVANCED_RUNTIME_EXPORTS = [
  'Epoch',
  'ReactiveContext',
  'ReactiveLink',
  'ReactiveNode',
] as const;

/**
 * Returns the sorted runtime export names of a module namespace.
 */
function runtimeExportNames(api: object): string[] {
  return Object.keys(api).sort();
}

/**
 * Joins export names into a stable comparison string.
 */
function exportKey(names: readonly string[]): string {
  return [...names].sort().join(',');
}

/**
 * Verifies that graph primitives and algorithms are available through the
 * package root.
 */
function testPublicGraphApi(): void {
  const graph = new DirectedGraph();

  const a = new Node('a', 'A');
  const b = new Node('b', 'B');

  graph.addNode(a);
  graph.addNode(b);

  graph.addEdge(a.id, b.id);
  graph.addEdge(b.id, a.id);

  const components = stronglyConnectedComponents(graph);

  assert(components.length === 1, 'package root should expose the SCC algorithm correctly');

  assert(
    components[0]?.length === 2,
    'package root should expose Node and DirectedGraph correctly',
  );
}

/**
 * Verifies that reactive primitives are available through the package root.
 */
function testPublicReactiveApi(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  assert(source.value === 10, 'package root should expose ReactiveValue correctly');
}

/**
 * Verifies that the published runtime export set is explicit and unchanged.
 */
function testPublicRuntimeExportFreeze(): void {
  assert(
    runtimeExportNames(graphApi).join(',') === exportKey(GRAPH_RUNTIME_EXPORTS),
    'graph public runtime exports should match the frozen graph API',
  );

  assert(
    runtimeExportNames(reactiveApi).join(',') === exportKey(REACTIVE_RUNTIME_EXPORTS),
    'reactive public runtime exports should match the frozen reactive API',
  );

  const expectedRootExports = exportKey([...GRAPH_RUNTIME_EXPORTS, ...REACTIVE_RUNTIME_EXPORTS]);

  assert(
    runtimeExportNames(publicApi).join(',') === expectedRootExports,
    'package root should re-export exactly the graph and reactive public surfaces',
  );

  assert(
    runtimeExportNames(advancedApi).join(',') === exportKey(ADVANCED_RUNTIME_EXPORTS),
    'advanced subpath should expose exactly the low-level reactive primitives',
  );
}

/**
 * Keeps public type-only exports referenced so they remain part of the
 * published contract.
 */
function testPublicTypeExports(): void {
  const types:
    | [
        ReactiveEffectScheduleHandle,
        ReactiveEffectScheduler,
        ReactiveGraphMetrics,
        ReactiveGraphSnapshot,
        ReactiveGraphSnapshotDiff,
        ReactiveGraphSnapshotEdge,
        ReactiveGraphSnapshotNode,
        ReactiveGraphSnapshotNodeChange,
        ReactiveNodeInspection,
        ReactiveRuntimeInspection,
        ReactiveRuntimeState,
        ReactiveNodeKind,
        ReactiveNodeState,
      ]
    | undefined = undefined;

  assert(types === undefined, 'public type exports should remain importable from the package root');
}

testPublicGraphApi();
testPublicReactiveApi();
testPublicRuntimeExportFreeze();
testPublicTypeExports();
