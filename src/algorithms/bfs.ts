import {DirectedGraph} from '../graph/directed-graph.js';
import {GraphNode} from '../graph/graph-node.js';
import {Queue} from '../data-structures/queue.js';

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
 * A Set keeps track of visited nodes so cycles cannot cause an infinite
 * traversal.
 *
 * A Queue provides FIFO behavior without the O(n) cost of Array.shift().
 *
 * @param graph - The directed graph to traverse.
 * @param startId - ID of the node where traversal should begin.
 * @returns The nodes visited in breadth-first order.
 * @throws {Error} If the starting node does not exist.
 */
export function breadthFirstSearch(graph: DirectedGraph, startId: string): GraphNode[] {
  const startNode = graph.getNode(startId);

  if (!startNode) {
    throw new Error(`Node "${startId}" does not exist.`);
  }

  // BFS needs a FIFO queue so nodes are processed level by level.
  const queue = new Queue<GraphNode>();

  // A Set prevents us from visiting the same node more than once.
  const visited = new Set<string>();

  // Store the traversal order separately from the queue.
  const result: GraphNode[] = [];

  // The traversal begins with the starting node.
  queue.enqueue(startNode);
  visited.add(startId);

  // Continue until there are no nodes waiting to be processed.
  while (!queue.isEmpty()) {
    // dequeue() is safe here because the loop guarantees the queue
    // contains at least one item.
    const current = queue.dequeue()!;

    // Record the node in the order in which BFS visits it.
    result.push(current);

    // Add each unvisited neighbor to the back of the queue.
    for (const neighbor of graph.getOutgoing(current.id)) {
      if (visited.has(neighbor.id)) {
        continue;
      }

      visited.add(neighbor.id);
      queue.enqueue(neighbor);
    }
  }

  return result;
}
