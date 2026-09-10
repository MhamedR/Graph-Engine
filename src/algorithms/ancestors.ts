import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';

/**
 * Returns every node that can reach the given node.
 *
 * An ancestor is a node from which there is a directed path to the
 * target node.
 *
 * For example:
 *
 *     A ───► B ───► C
 *     │
 *     └────► D
 *
 * The ancestors of C are:
 *
 *     A, B
 *
 * The target node itself is intentionally excluded.
 *
 * Unlike normal BFS, this traversal follows incoming edges instead of
 * outgoing edges. This allows us to walk backward through the graph.
 *
 * @param graph - The directed graph to search.
 * @param targetId - ID of the node whose ancestors should be found.
 * @returns All nodes that can reach the target node.
 * @throws {Error} If the target node does not exist.
 */
export function getAncestors(graph: DirectedGraph, targetId: string): GraphNode[] {
  // Make sure the target exists before accessing its incoming neighbors.
  const targetNode = graph.getNode(targetId);

  if (!targetNode) {
    throw new Error(`Node "${targetId}" does not exist.`);
  }

  // Use a queue because we are performing a breadth-first traversal.
  const queue: GraphNode[] = [targetNode];

  // Track visited nodes so cycles cannot cause infinite traversal.
  const visited = new Set<string>([targetId]);

  // Store ancestors in the order in which we discover them.
  const result: GraphNode[] = [];

  // Process nodes until there are no more ancestors to explore.
  while (queue.length > 0) {
    // Remove the next node from the front of the queue.
    const current = queue.shift()!;

    // Follow incoming edges instead of outgoing edges.
    for (const ancestor of graph.getIncoming(current.id)) {
      // Ignore nodes that have already been discovered.
      if (visited.has(ancestor.id)) {
        continue;
      }

      // Mark the ancestor before adding it to the queue.
      visited.add(ancestor.id);

      // Record the discovered ancestor.
      result.push(ancestor);

      // Continue walking backward from this ancestor.
      queue.push(ancestor);
    }
  }

  return result;
}
