import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';
import {Queue} from '../data-structures/queue.js';

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
 * This traversal follows incoming edges instead of outgoing edges,
 * allowing us to walk backward through the graph.
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

  // Use our reusable FIFO queue instead of Array.shift().
  const queue = new Queue<GraphNode>();

  // Track visited nodes so cycles cannot cause infinite traversal.
  const visited = new Set<string>([targetId]);

  // Store ancestors in the order in which they are discovered.
  const result: GraphNode[] = [];

  // The traversal starts at the target and moves backward.
  queue.enqueue(targetNode);

  // Continue until there are no more nodes to explore.
  while (!queue.isEmpty()) {
    // dequeue() is safe because the loop guarantees an available item.
    const current = queue.dequeue()!;

    // Follow incoming edges to discover upstream nodes.
    for (const ancestor of graph.getIncoming(current.id)) {
      // Ignore nodes that have already been discovered.
      if (visited.has(ancestor.id)) {
        continue;
      }

      // Mark the node before adding it to the queue.
      visited.add(ancestor.id);

      // Record the discovered ancestor.
      result.push(ancestor);

      // Continue walking backward from this ancestor.
      queue.enqueue(ancestor);
    }
  }

  return result;
}
