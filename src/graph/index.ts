/**
 * Public graph API.
 *
 * Application API:
 * - DirectedGraph, Node
 * - traversal and analysis functions
 *
 * Advanced API, kept for compatibility:
 * - GraphEdge is stored by DirectedGraph and can be read with getEdge().
 */

export {Node} from './node.js';
export {GraphEdge} from './graph-edge.js';
export {DirectedGraph} from './directed-graph.js';

export {breadthFirstSearch} from '../algorithms/bfs.js';
export {depthFirstSearch} from '../algorithms/dfs.js';
export {hasCycle} from '../algorithms/cycle-detection.js';
export {topologicalSort} from '../algorithms/topological-sort.js';
export {getReachableNodes} from '../algorithms/reachability.js';
export {hasPath} from '../algorithms/path-exists.js';
export {getAncestors} from '../algorithms/ancestors.js';
export {getDescendants} from '../algorithms/descendants.js';
export {stronglyConnectedComponents} from './strongly-connected-components.js';
