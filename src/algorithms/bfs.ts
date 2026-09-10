import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';

/**
 * Performs a breadth-first traversal of a directed graph.
 *
 * BFS explores the graph level by level. Starting from the given node,
 * it visits all directly connected nodes before moving to nodes that
 * are further away.
 *
 * For example:
 *
 *     A ───► B ───► D
 *     │
 *     └────► C ───► E
 *
 * Starting at A produces:
 *
 *     A → B → C → D → E
 *
 * A Set is used to keep track of visited nodes. This is important because
 * directed graphs may contain cycles, and we must not visit the same node
 * repeatedly.
 *
 * @param graph - The directed graph to traverse.
 * @param startId - ID of the node where traversal should begin.
 * @returns The nodes visited in breadth-first order.
 * @throws {Error} If the starting node does not exist.
 */
export function breadthFirstSearch(graph: DirectedGraph, startId: string): GraphNode[] {
  // Make sure the starting node exists before beginning the traversal.
  const startNode = graph.getNode(startId);

  if (!startNode) {
    throw new Error(`Node "${startId}" does not exist.`);
  }

  // The queue contains nodes that have been discovered but not
  // completely processed yet.
  const queue: GraphNode[] = [startNode];

  // A node is marked as visited when it is discovered.
  //
  // This prevents cycles such as A → B → A from causing an
  // infinite traversal.
  const visited = new Set<string>([startId]);

  // This array records the final traversal order.
  const result: GraphNode[] = [];

  // Continue until there are no more nodes waiting in the queue.
  while (queue.length > 0) {
    // Remove the first node from the queue.
    //
    // shift() gives us FIFO (First In, First Out) behavior.
    const current = queue.shift()!;

    // Record the node in the order in which BFS processes it.
    result.push(current);

    // Examine every node directly reachable from the current node.
    for (const neighbor of graph.getOutgoing(current.id)) {
      // Ignore nodes that we have already discovered.
      if (visited.has(neighbor.id)) {
        continue;
      }

      // Mark the node as discovered immediately.
      visited.add(neighbor.id);

      // Put the newly discovered node at the end of the queue.
      queue.push(neighbor);
    }
  }

  // Return the traversal order to the caller.
  return result;
}
