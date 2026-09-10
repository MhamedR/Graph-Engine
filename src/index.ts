import {DirectedGraph} from './graph/directed-graph.js';
import {GraphNode} from './graph/graph-node.js';
import {getAncestors} from './algorithms/ancestors.js';

/**
 * Creates the following directed graph:
 *
 *     A ───► B ───► C
 *     │
 *     └────► D
 *
 * E is disconnected.
 */
const graph = new DirectedGraph();

// Create the graph nodes.
const a = new GraphNode('A');
const b = new GraphNode('B');
const c = new GraphNode('C');
const d = new GraphNode('D');
const e = new GraphNode('E');

// Add the nodes to the graph.
graph.addNode(a);
graph.addNode(b);
graph.addNode(c);
graph.addNode(d);
graph.addNode(e);

// Add the directed edges.
graph.addEdge('A', 'B');
graph.addEdge('B', 'C');
graph.addEdge('A', 'D');

// Find nodes that can eventually reach C.
const ancestorsOfC = getAncestors(graph, 'C');

console.log(
  'Ancestors of C:',
  ancestorsOfC.map((node) => node.id),
);

// Find nodes that can eventually reach D.
const ancestorsOfD = getAncestors(graph, 'D');

console.log(
  'Ancestors of D:',
  ancestorsOfD.map((node) => node.id),
);

// E has no incoming path from another node.
const ancestorsOfE = getAncestors(graph, 'E');

console.log(
  'Ancestors of E:',
  ancestorsOfE.map((node) => node.id),
);
