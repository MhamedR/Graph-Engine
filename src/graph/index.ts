/**
 * Public entry point for the graph module.
 *
 * Re-exports the graph data structures and algorithms from one stable
 * module entry point.
 */

// Core graph data structures.
export {GraphNode} from './graph-node.js';
export {GraphEdge} from './graph-edge.js';
export {DirectedGraph} from './directed-graph.js';

/**
 * Public exports for graph traversal and analysis algorithms.
 */
export {breadthFirstSearch} from '../algorithms/bfs.js';
export {depthFirstSearch} from '../algorithms/dfs.js';
export {hasCycle} from '../algorithms/cycle-detection.js';
export {topologicalSort} from '../algorithms/topological-sort.js';
export {getReachableNodes} from '../algorithms/reachability.js';
export {hasPath} from '../algorithms/path-exists.js';
export {getAncestors} from '../algorithms/ancestors.js';
export {getDescendants} from '../algorithms/descendants.js';

/**
 * Public export for strongly connected components.
 */
export {stronglyConnectedComponents} from './strongly-connected-components.js';
