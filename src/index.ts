import {DirectedGraph} from './graph/directed-graph.js';
import {GraphNode} from './graph/graph-node.js';

const graph = new DirectedGraph();

graph.addNode(new GraphNode('A'));

console.log('After adding A:', graph.version);

graph.addNode(new GraphNode('B'));

console.log('After adding B:', graph.version);

graph.addEdge('A', 'B');

console.log('After adding A -> B:', graph.version);

graph.removeEdge('A', 'B');

console.log('After removing A -> B:', graph.version);
