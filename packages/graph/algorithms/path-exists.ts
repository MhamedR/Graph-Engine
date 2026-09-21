import {breadthFirstSearch} from './bfs.js';
import {DirectedGraph} from '../directed-graph.js';

/**
 * Determines whether a directed path exists between two nodes.
 *
 * A path exists when there is a sequence of directed edges that starts
 * at `fromId` and eventually reaches `toId`.
 *
 * For example:
 *
 *     A ───► B ───► C
 *
 * There is a path from A to C:
 *
 *     A → B → C
 *
 * But there is no path from C to A because the graph is directed.
 *
 * The starting node and destination node are considered reachable from
 * each other when they are the same node. This means:
 *
 *     hasPath(graph, "A", "A") === true
 *
 * @param graph - The directed graph to search.
 * @param fromId - ID of the starting node.
 * @param toId - ID of the destination node.
 * @returns `true` if a directed path exists from `fromId` to `toId`.
 * @throws {Error} If either node does not exist.
 */
export function hasPath<T>(graph: DirectedGraph<T>, fromId: string, toId: string): boolean {
  // Both nodes must exist before we begin the traversal.
  if (!graph.hasNode(fromId)) {
    throw new Error(`Node "${fromId}" does not exist.`);
  }

  if (!graph.hasNode(toId)) {
    throw new Error(`Node "${toId}" does not exist.`);
  }

  // A node always has a path to itself.
  if (fromId === toId) {
    return true;
  }

  // BFS gives us every node reachable from the starting node.
  const reachableNodes = breadthFirstSearch(graph, fromId);

  // Check whether the destination was among the visited nodes.
  return reachableNodes.some((node) => node.id === toId);
}
