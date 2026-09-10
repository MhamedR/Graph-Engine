import {GraphEdge} from './graph/graph-edge.js';

/**
 * Creates two independent relationships and verifies that each edge
 * receives its own identity.
 */
const firstEdge = new GraphEdge('A', 'B');
const secondEdge = new GraphEdge('B', 'C');

console.log('First edge:', {
  id: firstEdge.id,
  from: firstEdge.from,
  to: firstEdge.to,
});

console.log('Second edge:', {
  id: secondEdge.id,
  from: secondEdge.from,
  to: secondEdge.to,
});

console.log('IDs are different:', firstEdge.id !== secondEdge.id);
