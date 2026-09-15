/**
 * Verifies that the public package entry point exposes both the graph API
 * and the reactive API.
 *
 * This test intentionally imports from the package entry point rather than
 * internal graph or reactive modules.
 */

import {
  DirectedGraph,
  GraphNode,
  ReactiveRuntime,
  ReactiveValue,
  stronglyConnectedComponents,
} from './index.js';
import {assert} from './test/assert.js';

/**
 * Verifies that graph primitives and algorithms are available through the
 * package root.
 */
function testPublicGraphApi(): void {
  const graph = new DirectedGraph();

  const a = new GraphNode('a', 'A');
  const b = new GraphNode('b', 'B');

  graph.addNode(a);
  graph.addNode(b);

  // Create a two-node strongly connected component.
  graph.addEdge(a.id, b.id);
  graph.addEdge(b.id, a.id);

  const components = stronglyConnectedComponents(graph);

  assert(components.length === 1, 'package root should expose the SCC algorithm correctly');

  assert(
    components[0]?.length === 2,
    'package root should expose GraphNode and DirectedGraph correctly',
  );
}

/**
 * Verifies that reactive primitives are available through the package root.
 */
function testPublicReactiveApi(): void {
  const runtime = new ReactiveRuntime();
  const source = new ReactiveValue(runtime, 'source', 10);

  // Reading the value verifies that the ReactiveValue export is usable.
  assert(source.value === 10, 'package root should expose ReactiveValue correctly');
}

testPublicGraphApi();
testPublicReactiveApi();
