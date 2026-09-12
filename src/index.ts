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
/**
 * First computed value.
 *
 * The counter lets us verify that the computation is evaluated lazily and
 * only when its cached value is invalidated.
 */
let doubleCountComputations = 0;

const doubleCount = new ReactiveComputed(runtime, 'double-count', () => {
  // Record every actual execution of the computation function.
  doubleCountComputations++;

  // Compute the derived value from the reactive source.
  return count.value * 2;
});

/**
 * Second computed value that depends on another computed value.
 */
const quadrupleCount = new ReactiveComputed(
  runtime,
  'quadruple-count',
  () => doubleCount.value * 2,
);

/**
 * A computed value whose result can remain unchanged even when its
 * dependency changes.
 */
const stable = new ReactiveComputed(runtime, 'stable', () => {
  // Read the dependency so that `stable` becomes dependent on `count`.
  count.value;

  // Always return the same result.
  return 10;
});

/**
 * Establish the initial computed value and dependency relationship.
 */
console.log('Stable initial:', stable.value);

/**
 * Record the version after the initial computation.
 */
const stableVersion = stable.node.version;

/**
 * Change the dependency.
 *
 * `stable` should become dirty, but its computation should remain lazy.
 */
count.value = 7;

/**
 * The version should still be unchanged because `stable` has not
 * recomputed yet.
 */
console.log('Stable version before read:', stable.node.version);

/**
 * Reading the value forces recomputation.
 */
console.log('Stable after dependency change:', stable.value);

/**
 * The computed result is still `10`, so its version should remain the
 * same as before the dependency changed.
 */
console.log('Stable version after read:', stable.node.version);

console.log('Stable version unchanged:', stable.node.version === stableVersion);
