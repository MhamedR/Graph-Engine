import {breadthFirstSearch} from './bfs.js';
import {DirectedGraph} from '../directed-graph.js';
import {Node} from '../node.js';

/**
 * Returns every node that can be reached from a starting node.
 *
 * A node is considered reachable when there is a directed path from the
 * starting node to that node.
 *
 * For example:
 *
 *     A ───► B ───► D
 *     │
 *     └────► C ───► E
 *
 * Starting from A, the reachable nodes are:
 *
 *     B, C, D, E
 *
 * The starting node itself is intentionally excluded from the result.
 *
 * @param graph - The directed graph to search.
 * @param startId - ID of the node from which reachability is evaluated.
 * @returns All nodes reachable from the starting node.
 * @throws {Error} If the starting node does not exist.
 */
export function getReachableNodes<T>(graph: DirectedGraph<T>, startId: string): Node<T>[] {
  // Reuse the shared BFS implementation so reachability stays consistent
  // with breadthFirstSearch and uses Queue instead of Array.shift().
  return breadthFirstSearch(graph, startId).filter((node) => node.id !== startId);
}
