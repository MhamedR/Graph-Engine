import {
  DirectedGraph,
  Node,
  breadthFirstSearch,
  depthFirstSearch,
  getAncestors,
  getDescendants,
  getReachableNodes,
  hasCycle,
  hasPath,
  topologicalSort,
} from '../../src/graph/index.js';
import {assert} from '../assert.js';

/**
 * Creates a directed graph from node IDs and directed edges.
 */
function createGraph(ids: string[], edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();

  for (const id of ids) {
    graph.addNode(new Node(id));
  }

  for (const [from, to] of edges) {
    graph.addEdge(from, to);
  }

  return graph;
}

/**
 * Returns node IDs in the order they appear.
 */
function idsOf(nodes: Node[]): string[] {
  return nodes.map((node) => node.id);
}

/**
 * Verifies BFS level-order traversal on a branching graph.
 *
 *     a ───► b ───► d
 *     │
 *     └────► c ───► e
 */
function testBreadthFirstSearch(): void {
  const graph = createGraph(
    ['a', 'b', 'c', 'd', 'e'],
    [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'e'],
    ],
  );

  assert(
    idsOf(breadthFirstSearch(graph, 'a')).join(',') === 'a,b,c,d,e',
    'BFS should visit nodes level by level',
  );
}

/**
 * Verifies DFS explores one branch fully before the next.
 */
function testDepthFirstSearch(): void {
  const graph = createGraph(
    ['a', 'b', 'c', 'd', 'e'],
    [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'e'],
    ],
  );

  assert(
    idsOf(depthFirstSearch(graph, 'a')).join(',') === 'a,b,d,c,e',
    'DFS should explore each branch to completion before the next neighbor',
  );
}

/**
 * Verifies that traversal algorithms reject a missing start node.
 */
function testMissingStartNodeThrows(): void {
  const graph = createGraph(['a'], []);
  const expected = 'Node "missing" does not exist.';

  const operations: Array<() => unknown> = [
    () => breadthFirstSearch(graph, 'missing'),
    () => depthFirstSearch(graph, 'missing'),
    () => getReachableNodes(graph, 'missing'),
    () => getDescendants(graph, 'missing'),
    () => getAncestors(graph, 'missing'),
  ];

  for (const operation of operations) {
    let threw = false;

    try {
      operation();
    } catch (error) {
      threw = error instanceof Error && error.message === expected;
    }

    assert(threw, 'traversal of a missing start node should throw');
  }
}

/**
 * Verifies cycle detection for acyclic, cyclic, and self-loop graphs.
 */
function testCycleDetection(): void {
  const acyclic = createGraph(
    ['a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
  );
  const cyclic = createGraph(
    ['a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ],
  );
  const selfLoop = createGraph(['a'], [['a', 'a']]);
  const empty = new DirectedGraph();
  const disconnected = createGraph(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['c', 'd'],
      ['d', 'c'],
    ],
  );

  const diamond = createGraph(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ],
  );

  assert(!hasCycle(acyclic), 'a chain should be acyclic');
  assert(hasCycle(cyclic), 'a directed loop should be detected as a cycle');
  assert(hasCycle(selfLoop), 'a self-loop should be detected as a cycle');
  assert(!hasCycle(empty), 'an empty graph should be acyclic');
  assert(hasCycle(disconnected), 'a cycle in one component should be detected');
  assert(!hasCycle(diamond), 'a diamond DAG should be acyclic');
}

/**
 * Verifies Kahn topological sort and cycle rejection.
 */
function testTopologicalSort(): void {
  const graph = createGraph(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ],
  );

  const order = idsOf(topologicalSort(graph));

  assert(order[0] === 'a', 'source node a should appear first');
  assert(order.indexOf('b') < order.indexOf('d'), 'b should appear before d');
  assert(order.indexOf('c') < order.indexOf('d'), 'c should appear before d');
  assert(order.length === 4, 'topological sort should include every node');

  const cyclic = createGraph(
    ['a', 'b'],
    [
      ['a', 'b'],
      ['b', 'a'],
    ],
  );

  let threw = false;

  try {
    topologicalSort(cyclic);
  } catch (error) {
    threw =
      error instanceof Error &&
      error.message === 'Cannot perform topological sort: graph contains a cycle.';
  }

  assert(threw, 'topological sort should reject cyclic graphs');
}

/**
 * Verifies directed path existence, including the same-node case.
 */
function testHasPath(): void {
  const graph = createGraph(
    ['a', 'b', 'c'],
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
  );

  assert(hasPath(graph, 'a', 'c'), 'a path should exist from a to c');
  assert(hasPath(graph, 'a', 'a'), 'a node should have a path to itself');
  assert(!hasPath(graph, 'c', 'a'), 'a directed path should not exist in reverse');

  let missingFrom = false;
  let missingTo = false;

  try {
    hasPath(graph, 'missing', 'a');
  } catch (error) {
    missingFrom = error instanceof Error && error.message === 'Node "missing" does not exist.';
  }

  try {
    hasPath(graph, 'a', 'missing');
  } catch (error) {
    missingTo = error instanceof Error && error.message === 'Node "missing" does not exist.';
  }

  assert(missingFrom, 'hasPath should throw when the source is missing');
  assert(missingTo, 'hasPath should throw when the destination is missing');
}

/**
 * Verifies reachability, descendants, and ancestors on a branching graph.
 *
 *     a ───► b ───► c
 *     │
 *     └────► d
 */
function testReachabilityAncestorsAndDescendants(): void {
  const graph = createGraph(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'd'],
    ],
  );

  assert(
    idsOf(getReachableNodes(graph, 'a')).join(',') === 'b,d,c',
    'reachable nodes should exclude the start node',
  );
  assert(
    idsOf(getDescendants(graph, 'a')).sort().join(',') === 'b,c,d',
    'descendants of a should be b, c, and d',
  );
  assert(
    idsOf(getAncestors(graph, 'c')).sort().join(',') === 'a,b',
    'ancestors of c should be a and b',
  );
  assert(getDescendants(graph, 'c').length === 0, 'a sink node should have no descendants');
  assert(getAncestors(graph, 'a').length === 0, 'a source node should have no ancestors');
}

/**
 * Verifies that cycles do not cause infinite traversal.
 */
function testCyclicTraversalTerminates(): void {
  const graph = createGraph(
    ['a', 'b'],
    [
      ['a', 'b'],
      ['b', 'a'],
    ],
  );

  assert(
    idsOf(breadthFirstSearch(graph, 'a')).join(',') === 'a,b',
    'BFS should terminate on a cycle',
  );
  assert(
    idsOf(depthFirstSearch(graph, 'a')).join(',') === 'a,b',
    'DFS should terminate on a cycle',
  );
  assert(
    idsOf(getDescendants(graph, 'a')).join(',') === 'b',
    'descendants should include the other cycle member once',
  );
}

/**
 * Verifies that iterative DFS and cycle detection handle a deep chain
 * without depending on recursive call-stack depth.
 */
function testDeepChainIsIterative(): void {
  const length = 10_000;
  const ids = Array.from({length}, (_, index) => `n${index}`);
  const edges: Array<[string, string]> = [];

  for (let index = 0; index < length - 1; index++) {
    edges.push([`n${index}`, `n${index + 1}`]);
  }

  const graph = createGraph(ids, edges);
  const traversal = depthFirstSearch(graph, 'n0');

  assert(traversal.length === length, 'iterative DFS should visit every node in a deep chain');
  assert(traversal[0]?.id === 'n0', 'iterative DFS should start at the source of the chain');
  assert(
    traversal[length - 1]?.id === `n${length - 1}`,
    'iterative DFS should finish at the end of the chain',
  );
  assert(!hasCycle(graph), 'a deep chain should remain acyclic');
}

testBreadthFirstSearch();
testDepthFirstSearch();
testMissingStartNodeThrows();
testCycleDetection();
testTopologicalSort();
testHasPath();
testReachabilityAncestorsAndDescendants();
testCyclicTraversalTerminates();
testDeepChainIsIterative();
