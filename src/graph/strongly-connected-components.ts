/**
 * Finds the strongly connected components of a directed graph.
 *
 * Kosaraju's algorithm performs two depth-first traversals:
 *
 * 1. Traverse the original graph and record nodes by completion order.
 * 2. Traverse the graph in reverse completion order using reversed edges.
 *
 * Each traversal of the reversed graph produces one strongly connected
 * component.
 */

import {DirectedGraph} from './directed-graph.js';
import {GraphNode} from './graph-node.js';

/**
 * Finds all strongly connected components in a directed graph.
 *
 * @param graph - Directed graph to analyze.
 * @returns Groups of nodes where every node can reach every other node.
 */
export function stronglyConnectedComponents(graph: DirectedGraph): GraphNode[][] {
  const visited = new Set<string>();
  const finishOrder: GraphNode[] = [];

  /**
   * Performs depth-first traversal of the original graph.
   *
   * @param node - Current node.
   */
  function visit(node: GraphNode): void {
    if (visited.has(node.id)) {
      return;
    }

    visited.add(node.id);

    // `getOutgoing()` returns destination GraphNode objects directly.
    for (const nextNode of graph.getOutgoing(node.id)) {
      visit(nextNode);
    }

    // Record the node after all descendants have finished.
    finishOrder.push(node);
  }

  // First pass: calculate DFS finishing order.
  for (const node of graph.getNodes()) {
    visit(node);
  }

  // Build the reversed adjacency relation.
  const reversed = new Map<string, GraphNode[]>();

  // Initialize an empty reversed adjacency list for every node.
  for (const node of graph.getNodes()) {
    reversed.set(node.id, []);
  }

  // Reverse every directed relationship.
  //
  // `getOutgoing()` already returns the destination GraphNode, so there is
  // no `edge.to` property to access here.
  for (const node of graph.getNodes()) {
    for (const nextNode of graph.getOutgoing(node.id)) {
      reversed.get(nextNode.id)?.push(node);
    }
  }

  // Reset visitation state for the second DFS pass.
  visited.clear();

  const components: GraphNode[][] = [];

  /**
   * Traverses the reversed graph and collects one component.
   *
   * @param node - Current node.
   * @param component - Component currently being collected.
   */
  function collectComponent(node: GraphNode, component: GraphNode[]): void {
    if (visited.has(node.id)) {
      return;
    }

    visited.add(node.id);
    component.push(node);

    // Follow reversed edges to discover nodes in the same SCC.
    for (const previous of reversed.get(node.id) ?? []) {
      collectComponent(previous, component);
    }
  }

  // Second pass: process nodes in reverse finishing order.
  for (const node of [...finishOrder].reverse()) {
    if (visited.has(node.id)) {
      continue;
    }

    const component: GraphNode[] = [];

    collectComponent(node, component);

    components.push(component);
  }

  return components;
}
