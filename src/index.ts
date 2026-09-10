import {DirectedGraph} from './graph/directed-graph.js';
import {GraphNode} from './graph/graph-node.js';

/**
 * Creates the following directed graph:
 *
 *     A ───► B ───► C
 *     │
 *     └────► D
 *
 * There are:
 *
 *     4 nodes
 *     3 directed edges
 */
const graph = new DirectedGraph();

// Create the graph nodes.
const a = new GraphNode('A');
const b = new GraphNode('B');
const c = new GraphNode('C');
const d = new GraphNode('D');

// Add the nodes to the graph.
graph.addNode(a);
graph.addNode(b);
graph.addNode(c);
graph.addNode(d);

// Add the directed edges.
graph.addEdge('A', 'B');
graph.addEdge('B', 'C');
graph.addEdge('A', 'D');

// Ask the graph for its statistics.
const stats = graph.getStats();

// Print the statistics.
console.log('Graph stats:', stats);

// Remove one edge.
graph.removeEdge('A', 'D');

// The edge count should now be one smaller.
console.log('After removing A → D:', graph.getStats());

// Remove an entire node.
graph.removeNode('B');

// Removing B also removes B → C.
console.log('After removing B:', graph.getStats());
