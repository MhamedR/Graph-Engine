import {DirectedGraph} from '../../src/graph/directed-graph.js';
import {GraphEdge} from '../../src/graph/graph-edge.js';
import {Node} from '../../src/graph/node.js';
import {assert} from '../assert.js';

/**
 * Creates a graph containing the given node IDs.
 */
function graphWithNodes(...ids: string[]): DirectedGraph {
  const graph = new DirectedGraph();

  for (const id of ids) {
    graph.addNode(new Node(id));
  }

  return graph;
}

/**
 * Verifies empty-graph metrics and node lookup behavior.
 */
function testEmptyGraph(): void {
  const graph = new DirectedGraph();

  assert(graph.getNodeCount() === 0, 'empty graph should contain no nodes');
  assert(graph.getEdgeCount() === 0, 'empty graph should contain no edges');
  assert(graph.version === 0, 'new graph should start at version 0');
  assert(!graph.hasNode('missing'), 'empty graph should not contain unknown nodes');
  assert(graph.getNode('missing') === undefined, 'unknown node lookup should return undefined');
  assert(graph.getNodes().length === 0, 'empty graph should return no nodes');
  assert(graph.getStats().nodeCount === 0, 'empty graph stats should report zero nodes');
  assert(graph.getStats().edgeCount === 0, 'empty graph stats should report zero edges');

  graph.validate();
}

/**
 * Verifies node insertion, identity, and duplicate rejection.
 */
function testAddNode(): void {
  const graph = new DirectedGraph();
  const node = new Node('a', 'Alpha');

  graph.addNode(node);

  assert(graph.hasNode('a'), 'added node should exist');
  assert(graph.getNode('a') === node, 'getNode should return the same Node instance');
  assert(graph.getNode('a')?.data === 'Alpha', 'node data should be preserved');
  assert(graph.getNodeCount() === 1, 'node count should increase after insertion');
  assert(graph.version === 1, 'adding a node should advance the graph version');
  assert(graph.getOutDegree('a') === 0, 'new node should have out-degree 0');
  assert(graph.getInDegree('a') === 0, 'new node should have in-degree 0');

  let threw = false;

  try {
    graph.addNode(new Node('a'));
  } catch (error) {
    threw = error instanceof Error && error.message === 'Node "a" already exists.';
  }

  assert(threw, 'adding a duplicate node ID should throw');
  assert(graph.getNodeCount() === 1, 'failed duplicate insert should not add a second node');
  assert(graph.version === 1, 'failed duplicate insert should not advance the version');
}

/**
 * Verifies that Node defaults its data to the node ID.
 */
function testNodeDefaultData(): void {
  const node = new Node('n1');

  assert(node.id === 'n1', 'node should retain the provided ID');
  assert(node.data === 'n1', 'node data should default to the ID');
}

/**
 * Verifies that a graph preserves a structured node payload.
 */
function testTypedNodePayload(): void {
  const graph = new DirectedGraph<{weight: number}>();
  const node = new Node('a', {weight: 10});

  graph.addNode(node);

  assert(graph.getNode('a') === node, 'getNode should return the typed Node instance');
  assert(graph.getNode('a')?.data.weight === 10, 'typed node payload should be preserved');
}

/**
 * Verifies directed edge insertion, lookup, and duplicate no-op behavior.
 */
function testAddEdge(): void {
  const graph = graphWithNodes('a', 'b', 'c');
  const versionAfterNodes = graph.version;

  graph.addEdge('a', 'b');

  assert(graph.hasEdge('a', 'b'), 'added edge should exist');
  assert(!graph.hasEdge('b', 'a'), 'directed edge should not imply the reverse edge');
  assert(graph.getEdgeCount() === 1, 'edge count should increase after insertion');
  assert(graph.getOutDegree('a') === 1, 'source out-degree should increase');
  assert(graph.getInDegree('b') === 1, 'destination in-degree should increase');
  assert(graph.version === versionAfterNodes + 1, 'adding an edge should advance the version');

  const outgoing = graph.getOutgoing('a');
  const incoming = graph.getIncoming('b');

  assert(outgoing.length === 1 && outgoing[0]?.id === 'b', 'outgoing neighbors should include b');
  assert(incoming.length === 1 && incoming[0]?.id === 'a', 'incoming neighbors should include a');

  const versionBeforeDuplicate = graph.version;
  graph.addEdge('a', 'b');

  assert(graph.getEdgeCount() === 1, 'duplicate edge insertion should be a no-op');
  assert(
    graph.version === versionBeforeDuplicate,
    'duplicate edge insertion should not advance the version',
  );

  graph.validate();
}

/**
 * Verifies that edges cannot be added to unknown nodes.
 */
function testAddEdgeRequiresExistingNodes(): void {
  const graph = graphWithNodes('a');

  let missingDestination = false;
  let missingSource = false;

  try {
    graph.addEdge('a', 'missing');
  } catch (error) {
    missingDestination =
      error instanceof Error && error.message === 'Node "missing" does not exist.';
  }

  try {
    graph.addEdge('missing', 'a');
  } catch (error) {
    missingSource = error instanceof Error && error.message === 'Node "missing" does not exist.';
  }

  assert(missingDestination, 'adding an edge to a missing destination should throw');
  assert(missingSource, 'adding an edge from a missing source should throw');
  assert(graph.getEdgeCount() === 0, 'failed edge insertion should not create an edge');
}

/**
 * Verifies that a node may have a self-loop.
 */
function testSelfLoop(): void {
  const graph = graphWithNodes('a');

  graph.addEdge('a', 'a');

  assert(graph.hasEdge('a', 'a'), 'self-loop should exist');
  assert(graph.getOutDegree('a') === 1, 'self-loop should count toward out-degree');
  assert(graph.getInDegree('a') === 1, 'self-loop should count toward in-degree');
  assert(graph.getOutgoing('a')[0]?.id === 'a', 'self-loop should appear in outgoing neighbors');
  assert(graph.getIncoming('a')[0]?.id === 'a', 'self-loop should appear in incoming neighbors');

  graph.validate();
}

/**
 * Verifies edge removal and missing-edge no-op behavior.
 */
function testRemoveEdge(): void {
  const graph = graphWithNodes('a', 'b');
  graph.addEdge('a', 'b');

  const versionBeforeRemoval = graph.version;
  graph.removeEdge('a', 'b');

  assert(!graph.hasEdge('a', 'b'), 'removed edge should no longer exist');
  assert(graph.getEdgeCount() === 0, 'edge count should decrease after removal');
  assert(graph.getOutDegree('a') === 0, 'source out-degree should return to 0');
  assert(graph.getInDegree('b') === 0, 'destination in-degree should return to 0');
  assert(graph.version === versionBeforeRemoval + 1, 'removing an edge should advance the version');

  const versionBeforeMissingRemoval = graph.version;
  graph.removeEdge('a', 'b');

  assert(
    graph.version === versionBeforeMissingRemoval,
    'removing a missing edge should not advance the version',
  );

  graph.validate();
}

/**
 * Verifies that removing a connected node also removes incident edges.
 */
function testRemoveConnectedNode(): void {
  const graph = graphWithNodes('a', 'b', 'c');
  graph.addEdge('a', 'b');
  graph.addEdge('c', 'b');
  graph.addEdge('b', 'c');

  const versionBeforeRemoval = graph.version;
  graph.removeNode('b');

  assert(!graph.hasNode('b'), 'removed node should no longer exist');
  assert(graph.getNodeCount() === 2, 'node count should decrease after removal');
  assert(graph.getEdgeCount() === 0, 'incident edges should be removed with the node');
  assert(!graph.hasEdge('a', 'c'), 'unrelated missing edge should remain absent');
  assert(
    graph.version === versionBeforeRemoval + 4,
    'removing a connected node should version each incident edge and the node itself',
  );

  graph.validate();
}

/**
 * Verifies that removing an isolated node is a structural change.
 */
function testRemoveIsolatedNodeVersion(): void {
  const graph = graphWithNodes('a');
  const versionBeforeRemoval = graph.version;

  graph.removeNode('a');

  assert(!graph.hasNode('a'), 'isolated node should be removed');
  assert(
    graph.version === versionBeforeRemoval + 1,
    'removing an isolated node should advance the graph version',
  );
}

/**
 * Verifies that removing an unknown node is a no-op.
 */
function testRemoveMissingNode(): void {
  const graph = graphWithNodes('a');
  const versionBeforeRemoval = graph.version;

  graph.removeNode('missing');

  assert(graph.hasNode('a'), 'existing nodes should be unchanged');
  assert(
    graph.version === versionBeforeRemoval,
    'removing a missing node should not advance version',
  );
}

/**
 * Verifies that queries throw when the requested node is absent.
 */
function testMissingNodeQueriesThrow(): void {
  const graph = new DirectedGraph();
  const expected = 'Node "missing" does not exist.';

  const operations: Array<() => void> = [
    () => graph.getOutgoing('missing'),
    () => graph.getIncoming('missing'),
    () => graph.getOutDegree('missing'),
    () => graph.getInDegree('missing'),
    () => graph.hasEdge('missing', 'missing'),
    () => graph.removeEdge('missing', 'missing'),
  ];

  for (const operation of operations) {
    let threw = false;

    try {
      operation();
    } catch (error) {
      threw = error instanceof Error && error.message === expected;
    }

    assert(threw, 'missing-node graph queries should throw');
  }
}

/**
 * Verifies that getNodes() returns a snapshot that does not mutate the graph.
 */
function testGetNodesSnapshot(): void {
  const graph = graphWithNodes('a', 'b');
  const nodes = graph.getNodes();

  nodes.pop();

  assert(graph.getNodeCount() === 2, 'mutating the getNodes() array should not change the graph');
}

/**
 * Verifies O(1) edge lookup and removal on a high-degree star.
 */
function testStarHasEdgeAndRemove(): void {
  const spokeCount = 200;
  const ids = ['hub', ...Array.from({length: spokeCount}, (_, index) => `s${index}`)];
  const graph = graphWithNodes(...ids);

  for (let index = 0; index < spokeCount; index++) {
    graph.addEdge('hub', `s${index}`);
  }

  assert(graph.getOutDegree('hub') === spokeCount, 'hub should have an edge to every spoke');
  assert(graph.hasEdge('hub', 's0'), 'first spoke should be connected');
  assert(graph.hasEdge('hub', `s${spokeCount - 1}`), 'last spoke should be connected');
  assert(!graph.hasEdge('s0', 'hub'), 'star edges should remain directed');

  graph.removeEdge('hub', 's0');

  assert(!graph.hasEdge('hub', 's0'), 'removed spoke edge should no longer exist');
  assert(
    graph.getOutDegree('hub') === spokeCount - 1,
    'removing one spoke should decrease out-degree',
  );
  assert(graph.hasEdge('hub', 's1'), 'unrelated spoke edges should remain');

  graph.validate();
}

/**
 * Verifies that edge IDs are assigned per graph and that getEdge returns the
 * shared edge object.
 */
function testEdgeIdsAreScopedToGraph(): void {
  const first = graphWithNodes('a', 'b');
  const second = graphWithNodes('a', 'b');

  first.addEdge('a', 'b');
  second.addEdge('a', 'b');

  const firstEdge = first.getEdge('a', 'b');
  const secondEdge = second.getEdge('a', 'b');

  assert(firstEdge !== undefined, 'first graph should store the added edge');
  assert(secondEdge !== undefined, 'second graph should store the added edge');
  assert(firstEdge?.id === 0, 'the first edge in a graph should receive ID 0');
  assert(secondEdge?.id === 0, 'a second graph should assign IDs independently');
  assert(firstEdge !== secondEdge, 'graphs should not share GraphEdge instances');

  first.addEdge('b', 'a');

  assert(
    first.getEdge('b', 'a')?.id === 1,
    'later edges in the same graph should increment the ID',
  );
  assert(second.getEdge('a', 'b')?.id === 0, 'the other graph should keep its own IDs');

  const detached = new GraphEdge('x', 'y');
  assert(detached.id === 0, 'a detached GraphEdge should default to ID 0');

  first.validate();
  second.validate();
}

/**
 * Verifies that getEdge returns undefined for a missing relationship and
 * throws for missing nodes.
 */
function testGetEdgeMissing(): void {
  const graph = graphWithNodes('a', 'b');

  assert(
    graph.getEdge('a', 'b') === undefined,
    'getEdge should return undefined when no edge exists',
  );

  let threw = false;

  try {
    graph.getEdge('a', 'missing');
  } catch (error) {
    threw = error instanceof Error && error.message === 'Node "missing" does not exist.';
  }

  assert(threw, 'getEdge should throw when a node is missing');
}

testEmptyGraph();
testAddNode();
testNodeDefaultData();
testTypedNodePayload();
testAddEdge();
testAddEdgeRequiresExistingNodes();
testSelfLoop();
testRemoveEdge();
testRemoveConnectedNode();
testRemoveIsolatedNodeVersion();
testRemoveMissingNode();
testMissingNodeQueriesThrow();
testGetNodesSnapshot();
testStarHasEdgeAndRemove();
testEdgeIdsAreScopedToGraph();
testGetEdgeMissing();
