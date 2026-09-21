/**
 * Tests the strongly connected components algorithm.
 *
 * The graph contains:
 *
 *     A ⇄ B → C ⇄ D
 *
 *     E
 *
 * The expected components are:
 *
 * - {A, B}
 * - {C, D}
 * - {E}
 *
 * Node E is isolated and therefore forms its own component.
 */

import {DirectedGraph} from '../directed-graph.js';
import {Node} from '../node.js';
import {stronglyConnectedComponents} from '../strongly-connected-components.js';
import {assert} from '../../../test/assert.js';

/**
 * Converts a component into a sorted node-ID string.
 *
 * @param component - Component whose IDs should be normalized.
 * @returns Sorted comma-separated node IDs.
 */
function componentKey(component: Node[]): string {
  return component
    .map((node) => node.id)
    .sort()
    .join(',');
}

/**
 * Verifies that Kosaraju's algorithm correctly identifies multiple
 * strongly connected components.
 */
function testStronglyConnectedComponents(): void {
  const graph = new DirectedGraph();

  const a = new Node('a', 'A');
  const b = new Node('b', 'B');
  const c = new Node('c', 'C');
  const d = new Node('d', 'D');
  const e = new Node('e', 'E');

  graph.addNode(a);
  graph.addNode(b);
  graph.addNode(c);
  graph.addNode(d);
  graph.addNode(e);

  // A and B form one strongly connected component.
  graph.addEdge(a.id, b.id);
  graph.addEdge(b.id, a.id);

  // B points into the second component.
  graph.addEdge(b.id, c.id);

  // C and D form another strongly connected component.
  graph.addEdge(c.id, d.id);
  graph.addEdge(d.id, c.id);

  const components = stronglyConnectedComponents(graph);

  const componentKeys = components.map(componentKey).sort();

  assert(componentKeys.length === 3, 'graph should contain three strongly connected components');

  assert(componentKeys[0] === 'a,b', 'first component should contain A and B');

  assert(componentKeys[1] === 'c,d', 'second component should contain C and D');

  assert(componentKeys[2] === 'e', 'isolated E should form its own component');
}

testStronglyConnectedComponents();
