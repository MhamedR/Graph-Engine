import {ReactiveRuntime} from './reactive/reactive-runtime.js';
import {ReactiveValue} from './reactive/reactive-value.js';
import {ReactiveComputed} from './reactive/reactive-computed.js';

/**
 * Creates the reactive runtime used by all nodes in this example.
 */
const runtime = new ReactiveRuntime();

/**
 * Base reactive value.
 */
const count = new ReactiveValue(runtime, 'count', 1);

/**
 * First computed value.
 */
const doubleCount = new ReactiveComputed(runtime, 'double-count', () => count.value * 2);

/**
 * Second computed value that depends on another computed value.
 */
const quadrupleCount = new ReactiveComputed(
  runtime,
  'quadruple-count',
  () => doubleCount.value * 2,
);

/**
 * Evaluate the outer computed value.
 *
 * This causes the complete dependency chain to be established:
 *
 *     count ──► double-count ──► quadruple-count
 */
console.log('Quadruple:', quadrupleCount.value);

/**
 * Inspect the dependency topology after evaluation.
 *
 * The first evaluation has now established the dependency relationships.
 */
console.log('doubleCount producers:', doubleCount.node.producerCount);

console.log('doubleCount consumers:', doubleCount.node.consumerCount);

console.log('quadrupleCount producers:', quadrupleCount.node.producerCount);

console.log('quadrupleCount consumers:', quadrupleCount.node.consumerCount);
