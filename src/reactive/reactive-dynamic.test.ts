import {ReactiveRuntime} from './reactive-runtime.js';
import {ReactiveValue} from './reactive-value.js';
import {ReactiveComputed} from './reactive-computed.js';
import {assert} from '../test/assert.js';

/**
 * Creates a fresh runtime for this dynamic dependency test.
 */
const runtime = new ReactiveRuntime();

/**
 * Controls which source the computed value should use.
 *
 *     true  → first
 *     false → second
 */
const useFirst = new ReactiveValue(runtime, 'use-first', true);

/**
 * First possible source.
 */
const first = new ReactiveValue(runtime, 'first', 10);

/**
 * Second possible source.
 */
const second = new ReactiveValue(runtime, 'second', 20);

/**
 * Computed value with a dynamic dependency.
 *
 * The dependency graph initially becomes:
 *
 *     use-first ──► selected
 *     first     ──► selected
 */
const selected = new ReactiveComputed(runtime, 'selected', () => {
  // Only the branch that executes should become a dependency.
  return useFirst.value ? first.value : second.value;
});

/**
 * Establish the initial dependency set.
 */
assert(selected.value === 10, 'Expected the initial selected value to be 10.');

assert(
  selected.node.getProducerIds().includes('first'),
  'Expected selected to initially depend on first.',
);

assert(
  !selected.node.getProducerIds().includes('second'),
  'Expected selected not to initially depend on second.',
);

/**
 * Switch the active branch.
 */
useFirst.value = false;

/**
 * The computation should now use `second`.
 */
assert(selected.value === 20, 'Expected selected to switch to second.');

/**
 * The old dependency should have been removed.
 */
assert(
  !selected.node.getProducerIds().includes('first'),
  'Expected first to be removed from the dependencies.',
);

assert(
  selected.node.getProducerIds().includes('second'),
  'Expected second to become a dependency.',
);

/**
 * Changing the old producer must not invalidate the computed value.
 */
first.value = 100;

assert(selected.value === 20, 'Expected changes to the old producer to be ignored.');

/**
 * Changing the active producer must invalidate the computed value.
 */
second.value = 30;

assert(selected.value === 30, 'Expected changes to the active producer to recompute the value.');

console.log('Reactive dynamic dependency test passed.');

/**
 * Verifies that changing dynamic dependencies does not retain a stale
 * changed-producer record from the previous computation.
 */
{
  const runtime = new ReactiveRuntime();

  const useFirst = new ReactiveValue(runtime, 'clear-use-first', true);
  const first = new ReactiveValue(runtime, 'clear-first', 10);
  const second = new ReactiveValue(runtime, 'clear-second', 20);

  const selected = new ReactiveComputed(runtime, 'clear-selected', () =>
    useFirst.value ? first.value : second.value,
  );

  // Establish the initial dependency on `first`.
  assert(selected.value === 10, 'selected should initially use the first value');

  // Switch the dynamic dependency to `second`.
  useFirst.value = false;

  assert(selected.value === 20, 'selected should switch to the second value');

  // After recomputation, no producer should remain marked as changed.
  assert(
    selected.getChangedProducer() === undefined,
    'dynamic dependency switch should clear changed-producer state',
  );
}
