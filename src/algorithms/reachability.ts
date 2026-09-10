import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';

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
export function getReachableNodes(graph: DirectedGraph, startId: string): GraphNode[] {
  // Use BFS to discover every node reachable from the starting node.
  const traversal = breadthFirstTraversal(graph, startId);

  // The traversal includes the starting node itself.
  //
  // Reachability usually means "what can I get to from here?", so we
  // remove the starting node from the result.
  return traversal.filter((node) => node.id !== startId);
}

/**
 * Performs a breadth-first traversal internally.
 *
 * This helper is kept private because callers of this module only need
 * the higher-level reachability operation.
 *
 * @param graph - The graph being traversed.
 * @param startId - ID of the starting node.
 * @returns Every node discovered during the traversal, including the start.
 * @throws {Error} If the starting node does not exist.
 */
function breadthFirstTraversal(graph: DirectedGraph, startId: string): GraphNode[] {
  // Retrieve the starting node through the graph's public API.
  const startNode = graph.getNode(startId);

  if (!startNode) {
    throw new Error(`Node "${startId}" does not exist.`);
  }

  // The queue contains nodes that have been discovered but not processed.
  const queue: GraphNode[] = [startNode];

  // Track discovered nodes so cycles cannot cause infinite traversal.
  const visited = new Set<string>([startId]);

  // Store nodes in the order in which they are discovered.
  const result: GraphNode[] = [];

  // Continue processing until there are no more nodes in the queue.
  while (queue.length > 0) {
    // Remove the oldest node from the queue.
    const current = queue.shift()!;

    // Record the node in traversal order.
    result.push(current);

    // Examine all directly reachable neighbors.
    for (const neighbor of graph.getOutgoing(current.id)) {
      // Skip nodes we have already discovered.
      if (visited.has(neighbor.id)) {
        continue;
      }

      // Mark the neighbor as discovered.
      visited.add(neighbor.id);

      // Schedule the neighbor for later processing.
      queue.push(neighbor);
    }
  }

  // Return the complete traversal.
  return result;
}
